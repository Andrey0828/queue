# Перед парой

## Product
A Russian-language electronic queue for one student group. Students enter their surname and given name, join the end of the current class queue, see their position and leave. One administrator opens and closes registration, moves or swaps participants, adds and removes people, marks the next person as done, and finishes classes with retained history.

## Audience and context
Students using phones in a classroom or corridor. The administrator uses the same interface. Fast reading and large touch controls matter more than decoration.

## Confirmed requirements
The user approved the proposed single-active-queue workflow and requested a complete implementation, GitHub-ready source, Vercel deployment support, and instructions for connecting Supabase. No mock data or demonstration mode. Name entry is trust-based, not identity verification. Administrator passphrase and privileges must be checked on the server.

## Stack
Next.js and TypeScript on Vercel; Supabase Postgres. Database credentials stay on the server. Persistent database transactions protect order and concurrency.

## Design assumptions
No existing brand or interface. Use a bright, legible classroom interface, a compact numbered list, blue action color and warm orange highlights for the current participant. Product name is an editable default: «Перед парой». Build directly from the workflow already accepted by the user.
