import asyncio
import os
import httpx
from dotenv import load_dotenv

if os.getenv("ENVIRONMENT") == "production":
    raise RuntimeError("Este script solo puede ejecutarse en desarrollo")
from integrations.telegram_client import telegram_client

load_dotenv()


async def main():
    chat_id = "5844273174"  # Matias chat
    # Send a new message with a button
    btn_payload = {
        "chat_id": chat_id,
        "text": "Prueba de botones",
        "reply_markup": {
            "inline_keyboard": [[{"text": "Aprobar", "callback_data": "test_btn"}]]
        },
    }
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"https://api.telegram.org/bot{os.getenv('TELEGRAM_BOT_TOKEN')}/sendMessage",
            json=btn_payload,
        )
        data = res.json()
        print(data)
        msg_id = data["result"]["message_id"]

        print("Sent! Waiting 2 seconds then editing...")
        await asyncio.sleep(2)

        # Test editMessageText with None reply_markup
        edit_res = await telegram_client.edit_message_text(
            chat_id, msg_id, "Editado!", reply_markup={"inline_keyboard": []}
        )
        print(f"Edit result: {edit_res}")


if __name__ == "__main__":
    asyncio.run(main())
