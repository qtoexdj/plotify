"""SDD 009 title agent: LangGraph reasoning loop over title documents.

Independent from the sales chat agent in ``apps/api/agent/``. The agent only
proposes: its output goes through the deterministic verifier and the block
fact-checker before staging, and a lawyer approves in Centro de Control Legal.
"""

from agent_titulo.runner import TitleAgentRunOutcome, run_title_agent

__all__ = ["TitleAgentRunOutcome", "run_title_agent"]
