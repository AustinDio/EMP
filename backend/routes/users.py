
from flask import Blueprint, jsonify, request

from extensions import db
from models import User
from routes.decorators import roles_required


users_bp = Blueprint("users", __name__, url_prefix="/api/users")


def user_to_dict(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "department": user.department,
        "contact": user.contact,
        "status": user.status,
        "created_at": (
            user.created_at.isoformat()
            if user.created_at else None
        ),
    }


@users_bp.route("", methods=["GET"])
@roles_required("admin")
def get_users():
    query = User.query

    role = request.args.get("role")
    status = request.args.get("status")
    search = request.args.get("search", "").strip()

    if role:
        if role not in ("admin", "examiner", "student"):
            return jsonify({
                "error": "Invalid role filter."
            }), 400

        query = query.filter_by(role=role)

    if status:
        if status not in ("Active", "Inactive"):
            return jsonify({
                "error": "status must be Active or Inactive."
            }), 400

        query = query.filter_by(status=status)

    if search:
        query = query.filter(
            db.or_(
                User.name.ilike(f"%{search}%"),
                User.username.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%")
            )
        )

    users = query.order_by(User.id.asc()).all()

    return jsonify({
        "users": [user_to_dict(user) for user in users]
    }), 200


@users_bp.route("/examiners", methods=["POST"])
@roles_required("admin")
def create_examiner():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A valid JSON object is required."
        }), 400

    username = data.get("username")
    email = data.get("email")
    name = data.get("name")
    password = data.get("password")
    department = data.get("department")
    contact = data.get("contact")

    # Validate required fields.
    for field, value in (
        ("username", username),
        ("email", email),
        ("name", name),
        ("password", password),
    ):
        if not isinstance(value, str) or not value.strip():
            return jsonify({
                "error": f"{field} is required."
            }), 400

    username = username.strip()
    email = email.strip().lower()
    name = name.strip()

    if len(password) < 8:
        return jsonify({
            "error": "Password must contain at least 8 characters."
        }), 400

    if "@" not in email or email.startswith("@") or email.endswith("@"):
        return jsonify({
            "error": "Enter a valid email address."
        }), 400

    if department is not None and not isinstance(department, str):
        return jsonify({
            "error": "department must be text."
        }), 400

    if contact is not None and not isinstance(contact, str):
        return jsonify({
            "error": "contact must be text."
        }), 400

    if User.query.filter_by(username=username).first():
        return jsonify({
            "error": "Username already exists."
        }), 409

    if User.query.filter_by(email=email).first():
        return jsonify({
            "error": "Email already exists."
        }), 409

    examiner = User(
        username=username,
        email=email,
        name=name,
        role="examiner",
        department=department.strip() if department else None,
        contact=contact.strip() if contact else None,
        status="Active",
    )

    examiner.set_password(password)

    db.session.add(examiner)
    db.session.commit()

    return jsonify({
        "message": "Examiner account created successfully.",
        "user": user_to_dict(examiner),
    }), 201


@users_bp.route("/<int:user_id>/status", methods=["PATCH"])
@roles_required("admin")
def update_user_status(user_id):
    user = db.session.get(User, user_id)

    if user is None:
        return jsonify({
            "error": "User not found."
        }), 404

    # Protect administrator accounts from being disabled here.
    if user.role == "admin":
        return jsonify({
            "error": "Administrator status cannot be changed through this endpoint."
        }), 403

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A valid JSON object is required."
        }), 400

    status = data.get("status")

    if status not in ("Active", "Inactive"):
        return jsonify({
            "error": "status must be Active or Inactive."
        }), 400

    user.status = status
    db.session.commit()

    return jsonify({
        "message": "User status updated successfully.",
        "user": user_to_dict(user),
    }), 200
