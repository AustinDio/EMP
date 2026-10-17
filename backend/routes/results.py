
from flask import Blueprint, jsonify, request
from flask_login import current_user

from extensions import db
from models import Evaluation
from routes.decorators import roles_required


results_bp = Blueprint(
    "results",
    __name__,
    url_prefix="/api/results"
)


def result_to_dict(evaluation):
    booking = evaluation.booking
    slot = booking.slot
    examination = slot.examination

    return {
        "evaluation_id": evaluation.id,
        "booking_id": booking.id,
        "student_id": evaluation.student_id,
        "student_name": evaluation.student.name,
        "examiner_id": evaluation.examiner_id,
        "examiner_name": evaluation.examiner.name,
        "examination_id": examination.id,
        "examination_name": examination.name,
        "course_name": examination.course.course_name,
        "exam_date": slot.exam_date.isoformat(),
        "maximum_marks": examination.maximum_marks,
        "total_marks": evaluation.total_marks,
        "remarks": evaluation.remarks,
        "evaluation_date": (
            evaluation.evaluation_date.isoformat()
            if evaluation.evaluation_date else None
        ),
        "status": evaluation.status,
    }


# Admin: view submitted and published evaluations.
@results_bp.route("", methods=["GET"])
@roles_required("admin")
def get_all_results():
    query = Evaluation.query

    status = request.args.get("status")

    if status:
        if status not in ("Submitted", "Published"):
            return jsonify({
                "error": "status must be Submitted or Published."
            }), 400

        query = query.filter_by(status=status)

    evaluations = query.order_by(Evaluation.id.desc()).all()

    return jsonify({
        "results": [
            result_to_dict(evaluation)
            for evaluation in evaluations
        ]
    }), 200


# Admin: publish an evaluation so the student can see it.
@results_bp.route(
    "/<int:evaluation_id>/publish",
    methods=["POST"]
)
@roles_required("admin")
def publish_result(evaluation_id):
    evaluation = db.session.get(Evaluation, evaluation_id)

    if evaluation is None:
        return jsonify({"error": "Evaluation not found."}), 404

    if evaluation.status == "Published":
        return jsonify({
            "error": "This result has already been published."
        }), 409

    if evaluation.status != "Submitted":
        return jsonify({
            "error": "Only submitted evaluations can be published."
        }), 400

    evaluation.status = "Published"
    db.session.commit()

    return jsonify({
        "message": "Result published successfully.",
        "result": result_to_dict(evaluation),
    }), 200


# Student: view only their own published results.
@results_bp.route("/my-results", methods=["GET"])
@roles_required("student")
def get_my_results():
    evaluations = (
        Evaluation.query
        .filter_by(
            student_id=current_user.id,
            status="Published"
        )
        .order_by(Evaluation.evaluation_date.desc())
        .all()
    )

    return jsonify({
        "results": [
            result_to_dict(evaluation)
            for evaluation in evaluations
        ]
    }), 200
