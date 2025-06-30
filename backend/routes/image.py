import base64
import uuid
import os
from flask import Blueprint, request, jsonify
from clients import imagen_client
from config import uploads_dir

image_bp = Blueprint('image_bp', __name__)

@image_bp.route('/api/generate_image', methods=['POST'])
def generate_image_route():
    if not imagen_client:
        return jsonify({"error": "Image generation service is not available. Check server configuration."}), 503

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400
    
    prompt = data.get('prompt')
    aspect_ratio = data.get('aspect_ratio', '1:1') # Default to 1:1 if not provided

    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    try:
        print(f"Received image generation request: prompt='{prompt}', aspect_ratio='{aspect_ratio}'")
        
        # Call GoogleImagen client
        # Parameters are based on the requirements: prompt and aspect_ratio from UI.
        # Other parameters like sample_count, output_mime_type, add_watermark are set to defaults.
        response_data = imagen_client.generate_image(
            prompt=prompt,
            sample_count=1, 
            aspect_ratio=aspect_ratio,
            output_mime_type="image/png", # Always request PNG for consistency
            add_watermark=False # Typically disabled for programmatic use unless specified
        )

        if response_data and "predictions" in response_data and response_data["predictions"]:
            prediction = response_data["predictions"][0]
            if "bytesBase64Encoded" in prediction and prediction["bytesBase64Encoded"]:
                image_b64_data = prediction["bytesBase64Encoded"]
                image_bytes = base64.b64decode(image_b64_data)
                
                # Determine file extension from mimeType if available, default to .png
                mime_type = prediction.get("mimeType", "image/png")
                extension = 'png' # Default to png as we requested it
                if mime_type.lower() == "image/jpeg":
                    extension = 'jpeg'
                
                image_filename = f"{uuid.uuid4()}.{extension}"
                image_save_path = os.path.join(uploads_dir, image_filename) # uploads_dir is backend/data/uploads/
                
                with open(image_save_path, "wb") as f:
                    f.write(image_bytes)
                
                image_url = f"/uploads/{image_filename}" # URL for frontend to fetch the image
                print(f"Image generated and saved to {image_save_path}. URL: {image_url}")
                return jsonify({"image_url": image_url, "filename": image_filename}), 200
            elif prediction.get("raiFilteredReason"):
                 error_msg = f"Image generation filtered by Responsible AI: {prediction['raiFilteredReason']}"
                 print(error_msg)
                 return jsonify({"error": error_msg}), 400 
            else:
                error_msg = "Image generation successful but no image data found in prediction."
                print(f"{error_msg} Response: {prediction}")
                return jsonify({"error": error_msg}), 500
        elif response_data: 
            error_msg = "Image generation returned an unexpected response format."
            print(f"{error_msg} Full response: {response_data}")
            return jsonify({"error": error_msg, "details": response_data}), 500
        else: 
            error_msg = "Image generation failed. Check server logs for details from Imagen client."
            print(error_msg)
            return jsonify({"error": error_msg}), 500

    except RuntimeError as e: 
        print(f"RuntimeError during image generation: {e}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        print(f"Unexpected error in /api/generate_image: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500
