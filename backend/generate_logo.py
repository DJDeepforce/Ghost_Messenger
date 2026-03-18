import asyncio
import base64
import os
from dotenv import load_dotenv
from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

load_dotenv('/app/backend/.env')

async def generate_ghost_logo():
    api_key = os.getenv('EMERGENT_LLM_KEY')
    
    image_gen = OpenAIImageGeneration(api_key=api_key)
    
    prompt = """A stylish, modern ghost logo for a secure messaging app called GhostChat. 
    The ghost should be:
    - Minimalist and elegant design
    - Semi-transparent with a soft glow effect
    - Purple/indigo color (#6366f1) with subtle gradients
    - Friendly but mysterious expression
    - Simple geometric shapes
    - Suitable for an app icon
    - Dark background (#0a0a0a)
    - The ghost should have a shield or lock subtle element to represent security
    - Clean vector-style illustration
    - No text, just the ghost character"""
    
    print("Generating ghost logo...")
    
    images = await image_gen.generate_images(
        prompt=prompt,
        model="gpt-image-1",
        number_of_images=1
    )
    
    if images and len(images) > 0:
        # Save as PNG
        with open("/app/frontend/assets/images/ghost-logo.png", "wb") as f:
            f.write(images[0])
        print("Ghost logo saved to /app/frontend/assets/images/ghost-logo.png")
        
        # Also save base64 version
        image_base64 = base64.b64encode(images[0]).decode('utf-8')
        print(f"Base64 length: {len(image_base64)} characters")
        return True
    else:
        print("No image was generated")
        return False

if __name__ == "__main__":
    result = asyncio.run(generate_ghost_logo())
    print(f"Success: {result}")
