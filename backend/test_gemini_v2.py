import os
import google.generativeai as genai
import json
from dotenv import load_dotenv

load_dotenv('.env')
api_key = os.environ.get('GEMINI_API_KEY')
print(f"API Key: {api_key[:10]}...")

genai.configure(api_key=api_key)
# UPDATED MODEL NAME
try:
    model = genai.GenerativeModel('models/gemini-2.0-flash')
    prompt = "Return a JSON list of 1 object for 'add a car'. Return ONLY the JSON array."
    response = model.generate_content(prompt)
    print("Response Status OK")
    print("RAW TEXT:")
    print(response.text)
except Exception as e:
    print(f"ERROR: {str(e)}")
