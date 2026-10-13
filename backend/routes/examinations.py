
from datetime import datetime

from flask import Blueprint, request, jsonify
from sqlalchemy import or_

from extensions import db
from models import Course, Examination, Slot
from routes.decorators import roles_required


examinations_bp = Blueprint(
    "examinations",
    __name__,
    url_prefix="/api/examinations"
)

ALLOWED_TYPES = [
    "Viva",
    "Practical",
    "Project Demo",
    "Assessment"
]

ALLOWED_STATUSES = [
    "Draft",
    "Slot Creation",
    "Booking Open",
    "Closed",
    "Completed"
]

DATE_FIELDS = [
    "slot_creation_start",
    "slot_creation_end",
    "booking_start",
    "booking_end"
]


def examination_to_dict(exam):
    return {
        "id": exam.id,
        "course_id": exam.course_id,
        "course_code": exam.course.course_code,
        "course_name": exam.course.course_name,
        "name": exam.name,
        "exam_type": exam.exam_type,
        "duration": exam.duration,
        "maximum_marks": exam.maximum_marks,
        "slot_creation_start": (
            exam.slot_creation_start.isoformat()
            if exam.slot_creation_start else None
        ),
        "slot_creation_end": (
            exam.slot_creation_end.isoformat()
            if exam.slot_creation_end else None
        ),
        "booking_start": (
            exam.booking_start.isoformat()
            if exam.booking_start else None
        ),
        "booking_end": (
            exam.booking_end.isoformat()
            if exam.booking_end else None
        ),
        "instructions": exam.instructions,
        "status": exam.status
    }


def parse_datetime(value, field_name):
    if value is None or value == "":
        return None

    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be an ISO date-time string.")

    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise ValueError(
            f"{field_name} must use YYYY-MM-DDTHH:MM format."
        )

    # This application stores local, timezone-naive date-times.
    if parsed.tzinfo is not None:
        raise ValueError(
            f"{field_name} must not include a timezone offset."
        )

    return parsed


def validate_timeline(values):
    creation_start = values.get("slot_creation_start")
    creation_end = values.get("slot_creation_end")
    booking_start = values.get("booking_start")
    booking_end = values.get("booking_end")

    # Each timeline must be complete or entirely unset.
    if (creation_start is None) != (creation_end is None):
        return "Both slot-creation dates must be provided together."

    if (booking_start is None) != (booking_end is None):
        return "Both booking dates must be provided together."

    if creation_start and creation_end:
        if creation_start >= creation_end:
            return "Slot-creation end must be after its start."

    if booking_start and booking_end:
        if booking_start >= booking_end:
            return "Booking end must be after its start."

    if creation_end and booking_start:
        if creation_end > booking_start:
            return (
                "Slot creation must end before or when booking begins."
            )

    return None


@examinations_bp.route("", methods=["GET"])
@roles_required("admin")
def get_examinations():
    search = request.args.get("search", "").strip()
    status = request.args.get("status", "").strip()
    exam_type = request.args.get("exam_type", "").strip()
    course_id = request.args.get("course_id", "").strip()

    query = Examination.query.join(Course)

    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                Examination.name.ilike(term),
                Course.course_name.ilike(term),
                Course.course_code.ilike(term)
            )
        )

    if status:
        if status not in ALLOWED_STATUSES:
            return jsonify({"error": "Invalid examination status."}), 400
        query = query.filter(Examination.status == status)

    if exam_type:
        if exam_type not in ALLOWED_TYPES:
            return jsonify({"error": "Invalid examination type."}), 400
        query = query.filter(Examination.exam_type == exam_type)

    if course_id:
        try:
            course_id = int(course_id)
        except ValueError:
            return jsonify({"error": "course_id must be an integer."}), 400

        query = query.filter(Examination.course_id == course_id)

    examinations = query.order_by(Examination.id.desc()).all()

    return jsonify({
        "examinations": [
            examination_to_dict(exam) for exam in examinations
        ],
        "total": len(examinations)
    }), 200


@examinations_bp.route("", methods=["POST"])
@roles_required("admin")
def create_examination():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    try:
        course_id = int(data.get("course_id"))
    except (ValueError, TypeError):
        return jsonify({"error": "A valid course_id is required."}), 400

    course = db.session.get(Course, course_id)

    if course is None:
        return jsonify({"error": "Course not found."}), 404

    if course.status != "Active":
        return jsonify({"error": "Cannot use an inactive course."}), 400

    name = data.get("name")
    exam_type = data.get("exam_type")
    instructions = data.get("instructions", "")

    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Examination name is required."}), 400

    if len(name.strip()) > 150:
        return jsonify({"error": "Examination name is too long."}), 400

    if exam_type not in ALLOWED_TYPES:
        return jsonify({
            "error": "Type must be Viva, Practical, Project Demo or Assessment."
        }), 400

    if not isinstance(instructions, str):
        return jsonify({"error": "Instructions must be text."}), 400

    try:
        duration = int(data.get("duration"))
        maximum_marks = int(data.get("maximum_marks"))
    except (ValueError, TypeError):
        return jsonify({
            "error": "Duration and maximum_marks must be integers."
        }), 400

    if duration <= 0 or duration > 1440:
        return jsonify({
            "error": "Duration must be between 1 and 1440 minutes."
        }), 400

    if maximum_marks <= 0 or maximum_marks > 100000:
        return jsonify({
            "error": "Maximum marks must be a positive reasonable value."
        }), 400

    dates = {}

    try:
        for field in DATE_FIELDS:
            dates[field] = parse_datetime(data.get(field), field)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    timeline_error = validate_timeline(dates)

    if timeline_error:
        return jsonify({"error": timeline_error}), 400

    status = data.get("status", "Draft")

    if status not in ALLOWED_STATUSES:
        return jsonify({"error": "Invalid examination status."}), 400

    exam = Examination(
        course_id=course_id,
        name=name.strip(),
        exam_type=exam_type,
        duration=duration,
        maximum_marks=maximum_marks,
        instructions=instructions.strip(),
        status=status,
        **dates
    )

    db.session.add(exam)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not create examination."}), 500

    return jsonify({
        "message": "Examination created successfully.",
        "examination": examination_to_dict(exam)
    }), 201


@examinations_bp.route("/<int:exam_id>", methods=["GET"])
@roles_required("admin")
def get_examination(exam_id):
    exam = db.session.get(Examination, exam_id)

    if exam is None:
        return jsonify({"error": "Examination not found."}), 404

    return jsonify({"examination": examination_to_dict(exam)}), 200


@examinations_bp.route("/<int:exam_id>", methods=["PUT"])
@roles_required("admin")
def update_examination(exam_id):
    exam = db.session.get(Examination, exam_id)

    if exam is None:
        return jsonify({"error": "Examination not found."}), 404

    data = request.get_json(silent=True)

    if not isinstance(data, dict) or not data:
        return jsonify({"error": "A non-empty JSON object is required."}), 400

    if "course_id" in data:
        try:
            course_id = int(data["course_id"])
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid course_id."}), 400

        course = db.session.get(Course, course_id)

        if course is None:
            return jsonify({"error": "Course not found."}), 404

        if course.status != "Active":
            return jsonify({"error": "Course must be active."}), 400

        exam.course_id = course_id

    if "name" in data:
        name = data["name"]

        if not isinstance(name, str) or not name.strip():
            return jsonify({"error": "Name cannot be empty."}), 400

        if len(name.strip()) > 150:
            return jsonify({"error": "Name is too long."}), 400

        exam.name = name.strip()

    if "exam_type" in data:
        if data["exam_type"] not in ALLOWED_TYPES:
            return jsonify({"error": "Invalid examination type."}), 400
        exam.exam_type = data["exam_type"]

    if "duration" in data:
        try:
            duration = int(data["duration"])
        except (ValueError, TypeError):
            return jsonify({"error": "Duration must be an integer."}), 400

        if duration < 1 or duration > 1440:
            return jsonify({"error": "Invalid duration."}), 400

        exam.duration = duration

    if "maximum_marks" in data:
        try:
            marks = int(data["maximum_marks"])
        except (ValueError, TypeError):
            return jsonify({
                "error": "Maximum marks must be an integer."
            }), 400

        if marks < 1 or marks > 100000:
            return jsonify({"error": "Invalid maximum marks."}), 400

        exam.maximum_marks = marks

    if "instructions" in data:
        if not isinstance(data["instructions"], str):
            return jsonify({"error": "Instructions must be text."}), 400
        exam.instructions = data["instructions"].strip()

    dates = {
        field: getattr(exam, field)
        for field in DATE_FIELDS
    }

    try:
        for field in DATE_FIELDS:
            if field in data:
                dates[field] = parse_datetime(data[field], field)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    timeline_error = validate_timeline(dates)

    if timeline_error:
        return jsonify({"error": timeline_error}), 400

    for field, value in dates.items():
        setattr(exam, field, value)

    if "status" in data:
        if data["status"] not in ALLOWED_STATUSES:
            return jsonify({"error": "Invalid examination status."}), 400
        exam.status = data["status"]

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not update examination."}), 500

    return jsonify({
        "message": "Examination updated successfully.",
        "examination": examination_to_dict(exam)
    }), 200


@examinations_bp.route("/<int:exam_id>", methods=["DELETE"])
@roles_required("admin")
def delete_examination(exam_id):
    exam = db.session.get(Examination, exam_id)

    if exam is None:
        return jsonify({"error": "Examination not found."}), 404

    # Preserve history if slots have already been created.
    has_slots = Slot.query.filter_by(examination_id=exam_id).first()

    if has_slots:
        return jsonify({
            "error": (
                "This examination has slots. "
                "Close it or update its status instead of deleting it."
            )
        }), 409

    db.session.delete(exam)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not delete examination."}), 500

    return jsonify({"message": "Examination deleted successfully."}), 200
