
from flask import Blueprint, request, jsonify
from sqlalchemy import or_

from extensions import db
from models import Course, Examination
from routes.decorators import roles_required


courses_bp = Blueprint("courses", __name__, url_prefix="/api/courses")


def course_to_dict(course):
    """Convert a Course object into JSON-friendly data."""
    return {
        "id": course.id,
        "course_code": course.course_code,
        "course_name": course.course_name,
        "description": course.description,
        "status": course.status
    }


@courses_bp.route("", methods=["GET"])
@roles_required("admin")
def get_courses():
    search = request.args.get("search", "").strip()
    status = request.args.get("status", "").strip()

    query = Course.query

    # Search by course code or course name.
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                Course.course_code.ilike(term),
                Course.course_name.ilike(term)
            )
        )

    # Optional status filter.
    if status:
        if status not in ["Active", "Inactive"]:
            return jsonify({
                "error": "Status must be Active or Inactive."
            }), 400

        query = query.filter_by(status=status)

    courses = query.order_by(Course.id.desc()).all()

    return jsonify({
        "courses": [course_to_dict(course) for course in courses],
        "total": len(courses)
    }), 200


@courses_bp.route("", methods=["POST"])
@roles_required("admin")
def create_course():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    course_code = data.get("course_code")
    course_name = data.get("course_name")
    description = data.get("description", "")

    if not isinstance(course_code, str) or not isinstance(course_name, str):
        return jsonify({
            "error": "Course code and course name must be strings."
        }), 400

    course_code = course_code.strip().upper()
    course_name = course_name.strip()

    if not course_code or not course_name:
        return jsonify({
            "error": "Course code and course name are required."
        }), 400

    if len(course_code) > 30 or len(course_name) > 150:
        return jsonify({
            "error": "Course code or course name is too long."
        }), 400

    if not isinstance(description, str):
        return jsonify({"error": "Description must be text."}), 400

    if Course.query.filter_by(course_code=course_code).first():
        return jsonify({
            "error": "A course with this course code already exists."
        }), 409

    course = Course(
        course_code=course_code,
        course_name=course_name,
        description=description.strip(),
        status="Active"
    )

    db.session.add(course)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not create the course."}), 500

    return jsonify({
        "message": "Course created successfully.",
        "course": course_to_dict(course)
    }), 201


@courses_bp.route("/<int:course_id>", methods=["GET"])
@roles_required("admin")
def get_course(course_id):
    course = db.session.get(Course, course_id)

    if course is None:
        return jsonify({"error": "Course not found."}), 404

    return jsonify({"course": course_to_dict(course)}), 200


@courses_bp.route("/<int:course_id>", methods=["PUT"])
@roles_required("admin")
def update_course(course_id):
    course = db.session.get(Course, course_id)

    if course is None:
        return jsonify({"error": "Course not found."}), 404

    data = request.get_json(silent=True)

    if not isinstance(data, dict) or not data:
        return jsonify({
            "error": "Provide a JSON object with fields to update."
        }), 400

    if "course_code" in data:
        code = data["course_code"]

        if not isinstance(code, str) or not code.strip():
            return jsonify({"error": "Course code cannot be empty."}), 400

        code = code.strip().upper()

        if len(code) > 30:
            return jsonify({"error": "Course code is too long."}), 400

        duplicate = Course.query.filter(
            Course.course_code == code,
            Course.id != course_id
        ).first()

        if duplicate:
            return jsonify({
                "error": "Another course already uses this code."
            }), 409

        course.course_code = code

    if "course_name" in data:
        name = data["course_name"]

        if not isinstance(name, str) or not name.strip():
            return jsonify({"error": "Course name cannot be empty."}), 400

        if len(name.strip()) > 150:
            return jsonify({"error": "Course name is too long."}), 400

        course.course_name = name.strip()

    if "description" in data:
        description = data["description"]

        if not isinstance(description, str):
            return jsonify({"error": "Description must be text."}), 400

        course.description = description.strip()

    if "status" in data:
        status = data["status"]

        if status not in ["Active", "Inactive"]:
            return jsonify({
                "error": "Status must be Active or Inactive."
            }), 400

        course.status = status

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not update the course."}), 500

    return jsonify({
        "message": "Course updated successfully.",
        "course": course_to_dict(course)
    }), 200


@courses_bp.route("/<int:course_id>", methods=["DELETE"])
@roles_required("admin")
def delete_course(course_id):
    course = db.session.get(Course, course_id)

    if course is None:
        return jsonify({"error": "Course not found."}), 404

    # Do not delete a course that has examinations.
    has_examinations = Examination.query.filter_by(
        course_id=course_id
    ).first()

    if has_examinations:
        return jsonify({
            "error": (
                "This course has examinations. "
                "Mark it Inactive instead of deleting it."
            )
        }), 409

    db.session.delete(course)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not delete the course."}), 500

    return jsonify({"message": "Course deleted successfully."}), 200
