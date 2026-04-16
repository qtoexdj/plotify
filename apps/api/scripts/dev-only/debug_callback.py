import asyncio
import json
import os
from dotenv import load_dotenv

if os.getenv("ENVIRONMENT") == "production":
    raise RuntimeError("Este script solo puede ejecutarse en desarrollo")
from integrations.telegram_client import telegram_client

load_dotenv()


async def main():
    payload_str = '{"update_id":969724390,"callback_query":{"id":"2595088235451965840","from":{"id":5844273174,"is_bot":False,"first_name":"Matias","language_code":"es"},"message":{"message_id":369,"from":{"id":8756834605,"is_bot":True,"first_name":"PlotifyAI","username":"plotify_ai_bot"},"chat":{"id":5844273174,"first_name":"Matias","type":"private"},"date":1742242137,"text":"Hola \ud83d\udc4b Soy el agente AI de Plotify."},"chat_instance":"3556066299103522237","data":"approve:9781b2ff-88af-4012-a659-251d018747a6"}}'
    payload = json.loads(payload_str)

    # Intenta responder
    res = await telegram_client.answer_callback_query(payload["callback_query"]["id"])
    print(f"Respuesta de answerCallbackQuery: {res}")


if __name__ == "__main__":
    asyncio.run(main())
