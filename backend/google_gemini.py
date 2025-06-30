from google.genai import types
from clients import get_genai_client
from config import PROJECT_ID

def call_gemini(prompt: str, system_instruction: str) -> str:
    """
    Calls the Gemini API with a given prompt and system instruction.

    Args:
        prompt: The user's prompt.
        system_instruction: The system instruction for the model.

    Returns:
        The response text from the Gemini API.
    """
    try:
        client = get_genai_client()

        model_name = "gemini-2.0-flash-001"
        
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=prompt)
                ]
            ),
        ]

        generate_content_config = types.GenerateContentConfig(
            temperature=1,
            top_p=1,
            max_output_tokens=8192,
            safety_settings=[
                types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF")
            ],
            system_instruction=types.Part.from_text(text=system_instruction),
        )
        
        full_response_text = ""
        for chunk in client.models.generate_content_stream(
            model=model_name,
            contents=contents,
            config=generate_content_config,
        ):
            if chunk.text:
                full_response_text += chunk.text
        
        return full_response_text.strip()

    except Exception as e:
        print(f"Error during Gemini call: {e}")
        import traceback
        traceback.print_exc()
        return ""

def refine_text_with_gemini(original_prompt: str) -> str:
    """
    Refines a given text prompt using the Gemini API.

    Args:
        original_prompt: The original text prompt to refine.

    Returns:
        The refined prompt.
    """
    si_text1 = """Help user to improve the prompt for Veo 2 video generation. Follow the rules below:
Translate the prompt into English
Refine the prompt for generate better video
Output the prompt only
Do only prompt refine not anything else"""
    
    return call_gemini(original_prompt, si_text1)
