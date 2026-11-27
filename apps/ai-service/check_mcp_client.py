import asyncio
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

async def main():
    params = StdioServerParameters(command="python", args=["server.py"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(
                "draft_questions",
                {
                    "topic": "Software Engineer at Google",
                    "sections": ["Background", "Core concepts", "Follow-ups"],
                },
            )
            questions = result.structured_content["result"]
            assert questions[0]["sectionName"] == "Background"
            assert "Software Engineer at Google" in questions[0]["prompt"]
            print("mcp client ok")

asyncio.run(main())