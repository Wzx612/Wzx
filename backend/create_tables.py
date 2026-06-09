"""Run this script once to create all DB tables:  python create_tables.py"""
import asyncio
import logging

logging.basicConfig(level=logging.INFO)


async def main() -> None:
    from app.core.database import create_all_tables
    await create_all_tables()
    logging.getLogger(__name__).info("All tables created successfully.")


if __name__ == "__main__":
    asyncio.run(main())
