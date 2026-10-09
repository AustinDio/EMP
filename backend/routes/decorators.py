
from functools import wraps

from flask import jsonify
from flask_login import current_user


def roles_required(*allowed_roles):
    def decorator(function):
        @wraps(function)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({
                    "error": "Authentication required."
                }), 401

            if current_user.status != "Active":
                return jsonify({
                    "error": "This account is inactive."
                }), 403

            if current_user.role not in allowed_roles:
                return jsonify({
                    "error": "You do not have permission to access this resource."
                }), 403

            return function(*args, **kwargs)

        return wrapper
    return decorator