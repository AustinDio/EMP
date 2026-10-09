
from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, current_user

from extensions import db
from models import User


auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def user_to_dict(user):
    """Return safe user information without the password hash."""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "department": user.department,
        "contact": user.contact,
        "status": user.status
    }


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    username = data.get("username", "").strip()
    email = data.get("email", "").strip().lower()
    name = data.get("name", "").strip()
    password = data.get("password", "")

    # Basic input validation
    if not all([username, email, name, password]):
        return jsonify({
            "error": "Username, email, name and password are required."
        }), 400

    if len(username) > 80 or len(email) > 120 or len(name) > 120:
        return jsonify({
            "error": "One or more fields exceed the allowed length."
        }), 400

    if len(password) < 8:
        return jsonify({
            "error": "Password must contain at least 8 characters."
        }), 400

    if "@" not in email or email.startswith("@") or email.endswith("@"):
        return jsonify({"error": "Enter a valid email address."}), 400

    # Prevent duplicate usernames and email addresses
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists."}), 409

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered."}), 409

    # The public registration endpoint always creates a Student.
    user = User(
        username=username,
        email=email,
        name=name,
        role="student",
        status="Active"
    )

    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    return jsonify({
        "message": "Student registered successfully.",
        "user": user_to_dict(user)
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({
            "error": "Username and password are required."
        }), 400

    user = User.query.filter_by(username=username).first()

    if user is None or not user.check_password(password):
        return jsonify({
            "error": "Invalid username or password."
        }), 401

    if user.status != "Active":
        return jsonify({
            "error": "This account is inactive."
        }), 403

    login_user(user)

    return jsonify({
        "message": "Login successful.",
        "user": user_to_dict(user)
    }), 200


@auth_bp.route("/me", methods=["GET"])
def me():
    if not current_user.is_authenticated:
        return jsonify({"error": "Please log in first."}), 401

    if current_user.status != "Active":
        logout_user()
        return jsonify({"error": "This account is inactive."}), 403

    return jsonify({"user": user_to_dict(current_user)}), 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    if not current_user.is_authenticated:
        return jsonify({"error": "You are not logged in."}), 401

    logout_user()

    return jsonify({"message": "Logout successful."}), 200