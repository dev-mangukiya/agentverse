"""Standalone greetings and clarifying questions for empty workspace starters."""

_REPLIES = {
    "hi": "Hello! How can I help you today?",
    "hey": "Hey there! What can I do for you?",
    "hello": "Hello! How can I help you today?",
    "hola": "¡Hola! ¿En qué puedo ayudarte?",
    "yo": "Hey! What's up?",
    "sup": "Hey! What's on your mind?",
    "hii": "Hi! How can I help?",
    "hiii": "Hi there! How can I help?",
    "good morning": "Good morning! How can I help you today?",
    "good afternoon": "Good afternoon! What can I help with?",
    "good evening": "Good evening! How can I assist?",
    "good night": "Good night! Let me know if you need anything before you go.",
    "gm": "Good morning! How can I help?",
    "thanks": "You're welcome! Let me know if you need anything else.",
    "thank you": "You're welcome! Happy to help.",
    "thx": "You're welcome!",
    "ty": "You're welcome!",
    "bye": "Goodbye! Feel free to come back anytime.",
    "goodbye": "Goodbye! Have a great day!",
    "see you": "See you later!",
    "test": "Your message came through. What would you like to try?",
    "ping": "Pong! Your message came through.",
    "help me research a topic and explain the key findings with sources. my topic is": "What topic would you like me to research?",
    "help me write a draft. ask me about the audience and tone first. i want to write": "What are you writing, who is it for, and what tone would you like?",
    "help me understand and fix a coding problem. here is what i am trying to do": "What should the code do, and what happens when you run it? Paste the relevant code or error.",
    "help me find useful patterns in my data. here is the context": "What data would you like to explore? Attach a file or paste a few rows and tell me what you want to learn.",
}


def quick_reply(content: str) -> str | None:
    # Match the entire message. A greeting followed by a task, or a starter
    # with an actual topic, must reach the agents.
    return _REPLIES.get(content.strip().casefold().rstrip("!?.,:;"))


def needs_conversation_context(previous_reply: str | None) -> bool:
    # "Hi" can be a word to translate and "test" can answer a coding question.
    return previous_reply is not None and previous_reply not in _REPLIES.values()
