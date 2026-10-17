
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import Examination, Slot, User, Booking
from routes.decorators import roles_required


slots_bp = Blueprint("slots", __name__, url_prefix="/api/slots")


def slot_to_dict(slot):
    return {
        "id": slot.id,
        "examination_id": slot.examination_id,
        "examination_name": slot.examination.name,
        "examiner_id": slot.examiner_id,
        "examiner_name": slot.examiner.name,
        "exam_date": slot.exam_date.isoformat(),
        "start_time": slot.start_time.strftime("%H:%M"),
        "end_time": slot.end_time.strftime("%H:%M"),
        "capacity": slot.capacity,
        "available_seats": slot.available_seats,
        "status": slot.status,
        "meeting_link": slot.meeting_link,
    }


def parse_date(value):
    if not isinstance(value, str):
        return None

    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_time(value):
    if not isinstance(value, str):
        return None

    try:
        return datetime.strptime(value, "%H:%M").time()
    except ValueError:
        return None


def validate_slot_data(data, existing_slot=None):
    # Get examination ID.
    examination_id = data.get(
        "examination_id",
        existing_slot.examination_id if existing_slot else None
    )

    if (
        isinstance(examination_id, bool)
        or not isinstance(examination_id, int)
    ):
        return None, "examination_id must be an integer."

    examination = db.session.get(Examination, examination_id)

    if examination is None:
        return None, "Examination not found."

    if examination.status in ("Closed", "Completed"):
        return None, "Cannot create or update a slot for a closed or completed examination."

    # Get examiner ID.
    examiner_id = data.get(
        "examiner_id",
        existing_slot.examiner_id if existing_slot else None
    )

    if isinstance(examiner_id, bool) or not isinstance(examiner_id, int):
        return None, "examiner_id must be an integer."

    examiner = db.session.get(User, examiner_id)

    if examiner is None or examiner.role != "examiner":
        return None, "A valid examiner account is required."

    if examiner.status != "Active":
        return None, "The examiner account is inactive."

    # Parse date and time values.
    exam_date = parse_date(
        data.get(
            "exam_date",
            existing_slot.exam_date.isoformat() if existing_slot else None
        )
    )

    start_time = parse_time(
        data.get(
            "start_time",
            existing_slot.start_time.strftime("%H:%M")
            if existing_slot else None
        )
    )

    end_time = parse_time(
        data.get(
            "end_time",
            existing_slot.end_time.strftime("%H:%M")
            if existing_slot else None
        )
    )

    if exam_date is None:
        return None, "exam_date must use YYYY-MM-DD format."

    if start_time is None or end_time is None:
        return None, "start_time and end_time must use HH:MM format."

    if start_time >= end_time:
        return None, "end_time must be later than start_time."

    # Get capacity.
    capacity = data.get(
        "capacity",
        existing_slot.capacity if existing_slot else None
    )

    if (
        isinstance(capacity, bool)
        or not isinstance(capacity, int)
        or capacity <= 0
    ):
        return None, "capacity must be a positive integer."

    # Count bookings that are still active.
    booking_query = Booking.query.filter_by(status="Booked")

    if existing_slot:
        booking_query = booking_query.filter(
            Booking.slot_id == existing_slot.id
        )
        booked_count = booking_query.count()

        if capacity < booked_count:
            return None, (
                f"Capacity cannot be less than the {booked_count} "
                "existing bookings."
            )

    # Status and meeting link.
    status = data.get(
        "status",
        existing_slot.status if existing_slot else "Available"
    )

    if status not in ("Available", "Full", "Cancelled"):
        return None, "status must be Available or Cancelled."

    meeting_link = data.get(
        "meeting_link",
        existing_slot.meeting_link if existing_slot else None
    )

    if meeting_link is not None and not isinstance(meeting_link, str):
        return None, "meeting_link must be text."

    # Prevent the same examiner from receiving overlapping slots
    # on the same date.
    overlap_query = Slot.query.filter(
        Slot.examiner_id == examiner_id,
        Slot.exam_date == exam_date,
        Slot.status != "Cancelled",
        Slot.start_time < end_time,
        Slot.end_time > start_time,
    )

    if existing_slot:
        overlap_query = overlap_query.filter(
            Slot.id != existing_slot.id
        )

    if overlap_query.first():
        return None, "This examiner already has an overlapping slot."

    return {
        "examination": examination,
        "examiner_id": examiner_id,
        "exam_date": exam_date,
        "start_time": start_time,
        "end_time": end_time,
        "capacity": capacity,
        "status": status,
        "meeting_link": meeting_link.strip() if meeting_link else None,
    }, None


@slots_bp.route("", methods=["GET"])
@roles_required("admin")
def get_slots():
    query = Slot.query

    examination_id = request.args.get("examination_id")
    examiner_id = request.args.get("examiner_id")
    exam_date = request.args.get("exam_date")
    status = request.args.get("status")

    if examination_id:
        try:
            query = query.filter_by(
                examination_id=int(examination_id)
            )
        except ValueError:
            return jsonify({"error": "Invalid examination_id."}), 400

    if examiner_id:
        try:
            query = query.filter_by(examiner_id=int(examiner_id))
        except ValueError:
            return jsonify({"error": "Invalid examiner_id."}), 400

    if exam_date:
        parsed_date = parse_date(exam_date)

        if parsed_date is None:
            return jsonify({
                "error": "exam_date must use YYYY-MM-DD format."
            }), 400

        query = query.filter_by(exam_date=parsed_date)

    if status:
        if status not in ("Available", "Full", "Cancelled"):
            return jsonify({"error": "Invalid status filter."}), 400

        query = query.filter_by(status=status)

    slots = query.order_by(
        Slot.exam_date.asc(),
        Slot.start_time.asc()
    ).all()

    return jsonify({
        "slots": [slot_to_dict(slot) for slot in slots]
    }), 200


@slots_bp.route("/<int:slot_id>", methods=["GET"])
@roles_required("admin")
def get_slot(slot_id):
    slot = db.session.get(Slot, slot_id)

    if slot is None:
        return jsonify({"error": "Slot not found."}), 404

    return jsonify(slot_to_dict(slot)), 200


@slots_bp.route("", methods=["POST"])
@roles_required("admin")
def create_slot():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required."}), 400

    slot_data, error = validate_slot_data(data)

    if error:
        return jsonify({"error": error}), 400

    slot = Slot(
        examination_id=slot_data["examination"].id,
        examiner_id=slot_data["examiner_id"],
        exam_date=slot_data["exam_date"],
        start_time=slot_data["start_time"],
        end_time=slot_data["end_time"],
        capacity=slot_data["capacity"],
        available_seats=slot_data["capacity"],
        status=slot_data["status"],
        meeting_link=slot_data["meeting_link"],
    )

    db.session.add(slot)
    db.session.commit()

    return jsonify({
        "message": "Examination slot created successfully.",
        "slot": slot_to_dict(slot),
    }), 201


@slots_bp.route("/<int:slot_id>", methods=["PUT"])
@roles_required("admin")
def update_slot(slot_id):
    slot = db.session.get(Slot, slot_id)

    if slot is None:
        return jsonify({"error": "Slot not found."}), 404

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required."}), 400

    slot_data, error = validate_slot_data(
        data,
        existing_slot=slot
    )

    if error:
        return jsonify({"error": error}), 400

    booked_count = Booking.query.filter_by(
        slot_id=slot.id,
        status="Booked"
    ).count()

    slot.examination_id = slot_data["examination"].id
    slot.examiner_id = slot_data["examiner_id"]
    slot.exam_date = slot_data["exam_date"]
    slot.start_time = slot_data["start_time"]
    slot.end_time = slot_data["end_time"]
    slot.capacity = slot_data["capacity"]
    slot.available_seats = slot_data["capacity"] - booked_count
    slot.status = slot_data["status"]
    slot.meeting_link = slot_data["meeting_link"]

    if slot.available_seats == 0 and slot.status == "Available":
        slot.status = "Full"

    db.session.commit()

    return jsonify({
        "message": "Examination slot updated successfully.",
        "slot": slot_to_dict(slot),
    }), 200


@slots_bp.route("/<int:slot_id>", methods=["DELETE"])
@roles_required("admin")
def delete_slot(slot_id):
    slot = db.session.get(Slot, slot_id)

    if slot is None:
        return jsonify({"error": "Slot not found."}), 404

    if slot.bookings:
        return jsonify({
            "error": "Cannot delete a slot that has bookings. Cancel it instead."
        }), 409

    db.session.delete(slot)
    db.session.commit()

    return jsonify({
        "message": "Examination slot deleted successfully."
    }), 200
