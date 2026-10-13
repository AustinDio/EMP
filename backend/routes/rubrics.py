
from flask import Blueprint, jsonify, request

from extensions import db
from models import Examination, Rubric
from routes.decorators import roles_required


rubrics_bp = Blueprint("rubrics", __name__)


def rubric_to_dict(rubric):
    return {
        "id": rubric.id,
        "examination_id": rubric.examination_id,
        "criterion_name": rubric.criterion_name,
        "maximum_marks": rubric.maximum_marks,
        "weightage": rubric.weightage,
        "description": rubric.description,
    }


def validate_rubric_data(data, examination, existing_rubric=None):
    # Check that the criterion name is provided.
    criterion_name = data.get(
        "criterion_name",
        existing_rubric.criterion_name if existing_rubric else None
    )

    if not isinstance(criterion_name, str) or not criterion_name.strip():
        return None, "criterion_name is required."

    # Read maximum marks. For an update, keep the existing value
    # if maximum_marks was not included in the request.
    maximum_marks = data.get(
        "maximum_marks",
        existing_rubric.maximum_marks if existing_rubric else None
    )

    if (
        isinstance(maximum_marks, bool)
        or not isinstance(maximum_marks, (int, float))
        or maximum_marks <= 0
    ):
        return None, "maximum_marks must be a positive number."

    # Read weightage, which represents a percentage.
    weightage = data.get(
        "weightage",
        existing_rubric.weightage
        if existing_rubric else 0
    )

    if (
        isinstance(weightage, bool)
        or not isinstance(weightage, (int, float))
        or not 0 <= weightage <= 100
    ):
        return None, "weightage must be a number between 0 and 100."

    # Description is optional.
    description = data.get(
        "description",
        existing_rubric.description if existing_rubric else None
    )

    if description is not None and not isinstance(description, str):
        return None, "description must be text."

    # Calculate marks already assigned to other criteria.
    existing_query = Rubric.query.filter_by(
        examination_id=examination.id
    )

    if existing_rubric:
        existing_query = existing_query.filter(
            Rubric.id != existing_rubric.id
        )

    existing_total = (
        db.session.query(
            db.func.coalesce(db.func.sum(Rubric.maximum_marks), 0)
        )
        .filter(Rubric.examination_id == examination.id)
        .filter(
            Rubric.id != existing_rubric.id
            if existing_rubric else True
        )
        .scalar()
    )

    if float(existing_total) + float(maximum_marks) > examination.maximum_marks:
        return None, (
            "The total rubric marks cannot exceed the examination's "
            f"maximum marks of {examination.maximum_marks}."
        )

    return {
        "criterion_name": criterion_name.strip(),
        "maximum_marks": float(maximum_marks),
        "weightage": float(weightage),
        "description": description.strip() if description else None,
    }, None


@rubrics_bp.route(
    "/api/examinations/<int:exam_id>/rubrics",
    methods=["GET"]
)
@roles_required("admin")
def get_rubrics(exam_id):
    examination = db.session.get(Examination, exam_id)

    if examination is None:
        return jsonify({"error": "Examination not found."}), 404

    rubrics = Rubric.query.filter_by(
        examination_id=exam_id
    ).order_by(Rubric.id.asc()).all()

    return jsonify({
        "examination_id": exam_id,
        "examination_maximum_marks": examination.maximum_marks,
        "rubrics": [rubric_to_dict(rubric) for rubric in rubrics],
    }), 200


@rubrics_bp.route(
    "/api/examinations/<int:exam_id>/rubrics",
    methods=["POST"]
)
@roles_required("admin")
def create_rubric(exam_id):
    examination = db.session.get(Examination, exam_id)

    if examination is None:
        return jsonify({"error": "Examination not found."}), 404

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required."}), 400

    rubric_data, error = validate_rubric_data(data, examination)

    if error:
        return jsonify({"error": error}), 400

    rubric = Rubric(
        examination_id=exam_id,
        **rubric_data
    )

    db.session.add(rubric)
    db.session.commit()

    return jsonify({
        "message": "Rubric criterion created successfully.",
        "rubric": rubric_to_dict(rubric),
    }), 201


@rubrics_bp.route(
    "/api/rubrics/<int:rubric_id>",
    methods=["PUT"]
)
@roles_required("admin")
def update_rubric(rubric_id):
    rubric = db.session.get(Rubric, rubric_id)

    if rubric is None:
        return jsonify({"error": "Rubric criterion not found."}), 404

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required."}), 400

    examination = db.session.get(Examination, rubric.examination_id)

    rubric_data, error = validate_rubric_data(
        data,
        examination,
        existing_rubric=rubric
    )

    if error:
        return jsonify({"error": error}), 400

    rubric.criterion_name = rubric_data["criterion_name"]
    rubric.maximum_marks = rubric_data["maximum_marks"]
    rubric.weightage = rubric_data["weightage"]
    rubric.description = rubric_data["description"]

    db.session.commit()

    return jsonify({
        "message": "Rubric criterion updated successfully.",
        "rubric": rubric_to_dict(rubric),
    }), 200


@rubrics_bp.route(
    "/api/rubrics/<int:rubric_id>",
    methods=["DELETE"]
)
@roles_required("admin")
def delete_rubric(rubric_id):
    rubric = db.session.get(Rubric, rubric_id)

    if rubric is None:
        return jsonify({"error": "Rubric criterion not found."}), 404

    db.session.delete(rubric)
    db.session.commit()

    return jsonify({
        "message": "Rubric criterion deleted successfully."
    }), 200
