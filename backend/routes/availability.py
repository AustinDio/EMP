
from datetime import datetime, date

from flask import Blueprint, jsonify, request
from flask_login import current_user

from extensions import db
from models import ExaminerAvailability, User
from routes.decorators import roles_required


availability_bp = Blueprint(
    "availability",
    __name__,
    url_prefix="/api/availability"
)


def availability_to_dict(item):
    return {
        "id": item.id,
        "examiner_id": item.examiner_id,
        "examiner_name": item.examiner.name,
        "available_date": item.available_date.isoformat(),
        "start_time": item.start_time.strftime("%H:%M"),
        "end_time": item.end_time.strftime("%H:%M"),
        "status": item.status,
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


@availability_bp.route("", methods=["POST"])
@roles_required("examiner")
def create_availability():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required."}), 400

    available_date = parse_date(data.get("available_date"))
    start_time = parse_time(data.get("start_time"))
    end_time = parse_time(data.get("end_time"))

    if available_date is None:
        return jsonify({
            "error": "available_date must use YYYY-MM-DD format."
        }), 400

    if available_date < date.today():
        return jsonify({
            "error": "Availability cannot be set for a past date."
        }), 400

    if start_time is None or end_time is None:
        return jsonify({
            "error": "start_time and end_time must use HH:MM format."
        }), 400

    if start_time >= end_time:
        return jsonify({
            "error": "end_time must be later than start_time."
        }), 400

    # Prevent overlapping availability ranges for this examiner.
    overlapping = ExaminerAvailability.query.filter(
        ExaminerAvailability.examiner_id == current_user.id,
        ExaminerAvailability.available_date == available_date,
        ExaminerAvailability.status == "Available",
        ExaminerAvailability.start_time < end_time,
        ExaminerAvailability.end_time > start_time,
    ).first()

    if overlapping:
        return jsonify({
            "error": "This availability overlaps with an existing entry."
        }), 409

    item = ExaminerAvailability(
        examiner_id=current_user.id,
        available_date=available_date,
        start_time=start_time,
        end_time=end_time,
        status="Available",
    )

    db.session.add(item)
    db.session.commit()

    return jsonify({
        "message": "Availability created successfully.",
        "availability": availability_to_dict(item),
    }), 201


@availability_bp.route("", methods=["GET"])
@roles_required("examiner", "admin")
def get_availability():
    query = ExaminerAvailability.query

    # Examiners can see only their own availability.
    if current_user.role == "examiner":
        query = query.filter_by(examiner_id=current_user.id)

    # Admins can optionally filter by examiner ID.
    elif current_user.role == "admin":
        examiner_id = request.args.get("examiner_id")

        if examiner_id:
            try:
                examiner_id = int(examiner_id)
            except ValueError:
                return jsonify({
                    "error": "examiner_id must be an integer."
                }), 400

            examiner = db.session.get(User, examiner_id)

            if examiner is None or examiner.role != "examiner":
                return jsonify({
                    "error": "Examiner not found."
                }), 404

            query = query.filter_by(examiner_id=examiner_id)

    available_date = request.args.get("available_date")

    if available_date:
        parsed_date = parse_date(available_date)

        if parsed_date is None:
            return jsonify({
                "error": "available_date must use YYYY-MM-DD format."
            }), 400

        query = query.filter_by(available_date=parsed_date)

    items = query.order_by(
        ExaminerAvailability.available_date.asc(),
        ExaminerAvailability.start_time.asc()
    ).all()

    return jsonify({
        "availability": [
            availability_to_dict(item) for item in items
        ]
    }), 200


@availability_bp.route("/<int:availability_id>", methods=["DELETE"])
@roles_required("examiner")
def delete_availability(availability_id):
    item = db.session.get(
        ExaminerAvailability,
        availability_id
    )

    if item is None or item.examiner_id != current_user.id:
        return jsonify({
            "error": "Availability entry not found."
        }), 404

    db.session.delete(item)
    db.session.commit()

    return jsonify({
        "message": "Availability deleted successfully."
    }), 200
