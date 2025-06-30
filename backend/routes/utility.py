from flask import Blueprint, request, jsonify, send_from_directory
from config import (
    videos_dir,
    thumbnails_dir,
    uploads_dir,
    user_uploaded_music_dir,
)
from utils import get_processed_user_email_from_header
from google_gemini import refine_text_with_gemini

utility_bp = Blueprint('utility_bp', __name__)

@utility_bp.route('/api/refine-prompt', methods=['POST'])
def refine_prompt_route():
    data = request.get_json()
    if not data or 'prompt' not in data:
        return jsonify({"error": "Prompt is required in JSON body"}), 400

    original_prompt = data['prompt']
    
    try:
        refined_prompt = refine_text_with_gemini(original_prompt)

        if refined_prompt:
            return jsonify({"refined_prompt": refined_prompt}), 200
        else:
            print(f"Gemini stream resulted in empty refined prompt for original: {original_prompt}")
            return jsonify({"error": "Failed to refine prompt, Gemini returned empty content."}), 500

    except Exception as e:
        print(f"Error during prompt refinement: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

@utility_bp.route('/api/videos/<filename>')
def serve_video(filename):
    response = send_from_directory(videos_dir, filename)
    response.headers['Cache-Control'] = 'public, max-age=360000'
    return response

@utility_bp.route('/api/thumbnails/<filename>')
def serve_thumbnail(filename):
    response = send_from_directory(thumbnails_dir, filename)
    response.headers['Cache-Control'] = 'public, max-age=360000'
    return response

@utility_bp.route('/api/uploads/<filename>')
def serve_upload(filename):
    response = send_from_directory(uploads_dir, filename)
    response.headers['Cache-Control'] = 'public, max-age=360000'
    return response

@utility_bp.route('/api/user_uploaded_music/<filename>')
def serve_user_uploaded_music(filename):
    response = send_from_directory(user_uploaded_music_dir, filename)
    response.headers['Cache-Control'] = 'public, max-age=360000'
    return response

@utility_bp.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "OK"}), 200

@utility_bp.route('/api/user-info', methods=['GET'])
def user_info():
    user_email = get_processed_user_email_from_header()
    return jsonify({"email": user_email}), 200
