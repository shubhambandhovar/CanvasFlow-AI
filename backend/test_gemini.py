import os
import google.generativeai as genai
import json
from dotenv import load_dotenv

load_dotenv('.env')
api_key = os.environ.get('GEMINI_API_KEY')
print(f"API Key: {api_key[:10]}...")

genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-1.5-flash')

prompt = "Return a JSON list of 1 object: { \"type\": \"shape_create\", \"title\": \"Test\", \"description\": \"Test\", \"action\": { \"action\": \"create_shape\", \"shape_type\": \"circle\", \"data\": { \"x\": 100, \"y\": 100, \"radius\": 50 } } }"

try:
    response = model.generate_content(
        prompt,
        generation_config={"response_mime_type": "application/json"}
    )
    print("Response Status OK")
    print(response.text)
except Exception as e:
    print(f"ERROR: {str(e)}")
