from datetime import datetime, date

from flask import Blueprint, jsonify, request
from flask_login import current_user

from extensions import db
from models import Examination, Slot, Booking
from routes.decorators import roles_required


bookings_bp = Blueprint(
    "bookings",
    __name__,
    url_prefix="/api/bookings"
)


def booking_to_dict(booking):
    slot = booking.slot

    return {
        "id": booking.id,
        "student_id": booking.student_id,
        "student_name": booking.student.name,
        "slot_id": slot.id,
        "examination_id": slot.examination_id,
        "examination_name": slot.examination.name,
        "exam_date": slot.exam_date.isoformat(),
        "start_time": slot.start_time.strftime("%H:%M"),
        "end_time": slot.end_time.strftime("%H:%M"),
        "examiner_name": slot.examiner.name,
        "booking_date": (
            booking.booking_date.isoformat()
            if booking.booking_date else None
        ),
        "status": booking.status,
    }


def booking_window_is_open(examination):
    # Use the server's local time for these naive datetime fields.
    now = datetime.now()

    if (
        examination.booking_start
        and now < examination.booking_start
    ):
        return False

    if (
        examination.booking_end
        and now > examination.booking_end
    ):
        return False

    return True


@bookings_bp.route("/available-slots", methods=["GET"])
@roles_required("student")
def get_available_slots():
    slots = (
        Slot.query
        .filter(
            Slot.status == "Available",
            Slot.available_seats > 0,
            Slot.exam_date >= date.today()
        )
        .order_by(Slot.exam_date.asc(), Slot.start_time.asc())
        .all()
    )

    available = []

    for slot in slots:
        examination = slot.examination

        if examination.status != "Booking Open":
            continue

        if not booking_window_is_open(examination):
            continue

        available.append({
            "slot_id": slot.id,
            "examination_id": examination.id,
            "examination_name": examination.name,
            "course_name": examination.course.course_name,
            "exam_date": slot.exam_date.isoformat(),
            "start_time": slot.start_time.strftime("%H:%M"),
            "end_time": slot.end_time.strftime("%H:%M"),
            "examiner_name": slot.examiner.name,
            "capacity": slot.capacity,
            "available_seats": slot.available_seats,
            "meeting_link": slot.meeting_link,
        })

    return jsonify({"available_slots": available}), 200


@bookings_bp.route("", methods=["POST"])
@roles_required("student")
def create_booking():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required."}), 400

    slot_id = data.get("slot_id")

    if isinstance(slot_id, bool) or not isinstance(slot_id, int):
        return jsonify({"error": "slot_id must be an integer."}), 400

    slot = db.session.get(Slot, slot_id)

    if slot is None:
        return jsonify({"error": "Examination slot not found."}), 404

    examination = slot.examination

    if examination.status != "Booking Open":
        return jsonify({
            "error": "Booking is not open for this examination."
        }), 400

    if not booking_window_is_open(examination):
        return jsonify({
            "error": "This examination is outside its booking window."
        }), 400

    if slot.exam_date < date.today():
        return jsonify({
            "error": "Cannot book a slot in the past."
        }), 400

    if slot.status != "Available" or slot.available_seats <= 0:
        return jsonify({
            "error": "This slot is not available."
        }), 409

    # Allow each student only one active booking per examination.
    existing_booking = (
        Booking.query
        .join(Slot, Booking.slot_id == Slot.id)
        .filter(
            Booking.student_id == current_user.id,
            Booking.status == "Booked",
            Slot.examination_id == slot.examination_id
        )
        .first()
    )

    if existing_booking:
        return jsonify({
            "error": "You already have a booking for this examination."
        }), 409

    booking = Booking(
        student_id=current_user.id,
        slot_id=slot.id,
        status="Booked"
    )

    slot.available_seats -= 1

    if slot.available_seats == 0:
        slot.status = "Full"

    db.session.add(booking)
    db.session.commit()

    return jsonify({
        "message": "Examination slot booked successfully.",
        "booking": booking_to_dict(booking),
    }), 201


@bookings_bp.route("/my-bookings", methods=["GET"])
@roles_required("student")
def get_my_bookings():
    bookings = (
        Booking.query
        .filter_by(student_id=current_user.id)
        .order_by(Booking.booking_date.desc())
        .all()
    )

    return jsonify({
        "bookings": [
            booking_to_dict(booking)
            for booking in bookings
        ]
    }), 200


@bookings_bp.route("/<int:booking_id>", methods=["DELETE"])
@roles_required("student")
def cancel_booking(booking_id):
    booking = db.session.get(Booking, booking_id)

    if booking is None or booking.student_id != current_user.id:
        return jsonify({"error": "Booking not found."}), 404

    if booking.status != "Booked":
        return jsonify({
            "error": "This booking is not active."
        }), 400

    slot = booking.slot

    # Do not reopen a cancelled slot.
    if slot.status != "Cancelled":
        slot.available_seats = min(
            slot.available_seats + 1,
            slot.capacity
        )

        if slot.available_seats > 0:
            slot.status = "Available"

    booking.status = "Cancelled"

    db.session.commit()

    return jsonify({
        "message": "Booking cancelled successfully.",
        "booking": booking_to_dict(booking),
    }), 200
