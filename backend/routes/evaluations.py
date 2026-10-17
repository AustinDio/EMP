
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_login import current_user

from extensions import db
from models import Booking, Evaluation
from routes.decorators import roles_required


evaluations_bp = Blueprint(
    "evaluations",
    __name__,
    url_prefix="/api/evaluations"
)


def evaluation_to_dict(evaluation):
    booking = evaluation.booking
    slot = booking.slot

    return {
        "id": evaluation.id,
        "booking_id": booking.id,
        "student_id": evaluation.student_id,
        "student_name": evaluation.student.name,
        "examiner_id": evaluation.examiner_id,
        "examiner_name": evaluation.examiner.name,
        "examination_id": slot.examination_id,
        "examination_name": slot.examination.name,
        "maximum_marks": slot.examination.maximum_marks,
        "total_marks": evaluation.total_marks,
        "remarks": evaluation.remarks,
        "evaluation_date": (
            evaluation.evaluation_date.isoformat()
            if evaluation.evaluation_date else None
        ),
        "status": evaluation.status,
    }


@evaluations_bp.route("/assigned-bookings", methods=["GET"])
@roles_required("examiner")
def get_assigned_bookings():
    bookings = (
        Booking.query
        .join(Booking.slot)
        .filter(
            Booking.status == "Booked",
            Booking.slot.has(examiner_id=current_user.id)
        )
        .order_by(Booking.booking_date.desc())
        .all()
    )

    results = []

    for booking in bookings:
        slot = booking.slot
        examination = slot.examination

        results.append({
            "booking_id": booking.id,
            "student_id": booking.student_id,
            "student_name": booking.student.name,
            "examination_id": examination.id,
            "examination_name": examination.name,
            "exam_date": slot.exam_date.isoformat(),
            "start_time": slot.start_time.strftime("%H:%M"),
            "end_time": slot.end_time.strftime("%H:%M"),
            "maximum_marks": examination.maximum_marks,
            "evaluation_status": (
                booking.evaluation.status
                if booking.evaluation else "Pending"
            ),
        })

    return jsonify({"assigned_bookings": results}), 200


@evaluations_bp.route("/my-evaluations", methods=["GET"])
@roles_required("examiner")
def get_my_evaluations():
    evaluations = (
        Evaluation.query
        .filter_by(examiner_id=current_user.id)
        .order_by(Evaluation.evaluation_date.desc())
        .all()
    )

    return jsonify({
        "evaluations": [
            evaluation_to_dict(evaluation)
            for evaluation in evaluations
        ]
    }), 200


@evaluations_bp.route(
    "/bookings/<int:booking_id>",
    methods=["POST"]
)
@roles_required("examiner")
def submit_evaluation(booking_id):
    booking = db.session.get(Booking, booking_id)

    if booking is None:
        return jsonify({"error": "Booking not found."}), 404

    # Confirm this booking belongs to a slot assigned to this examiner.
    if booking.slot.examiner_id != current_user.id:
        return jsonify({
            "error": "You can evaluate only students assigned to your slots."
        }), 403

    if booking.status != "Booked":
        return jsonify({
            "error": "This booking is not active."
        }), 400

    # Prevent duplicate evaluations for the same booking.
    if booking.evaluation is not None:
        return jsonify({
            "error": "This booking has already been evaluated."
        }), 409

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required."}), 400

    total_marks = data.get("total_marks")
    remarks = data.get("remarks", "")

    if (
        isinstance(total_marks, bool)
        or not isinstance(total_marks, (int, float))
    ):
        return jsonify({
            "error": "total_marks must be a number."
        }), 400

    maximum_marks = booking.slot.examination.maximum_marks

    if total_marks < 0 or total_marks > maximum_marks:
        return jsonify({
            "error": f"total_marks must be between 0 and {maximum_marks}."
        }), 400

    if not isinstance(remarks, str):
        return jsonify({"error": "remarks must be text."}), 400

    evaluation = Evaluation(
        booking_id=booking.id,
        student_id=booking.student_id,
        examiner_id=current_user.id,
        total_marks=float(total_marks),
        remarks=remarks.strip() or None,
        evaluation_date=datetime.utcnow(),
        status="Submitted",
    )

    db.session.add(evaluation)
    db.session.commit()

    return jsonify({
        "message": "Evaluation submitted successfully.",
        "evaluation": evaluation_to_dict(evaluation),
    }), 201
