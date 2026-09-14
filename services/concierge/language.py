"""Normalização contextual, sem transformar instruções do cliente em ações."""
import re
import unicodedata
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def now_local() -> datetime:
    return datetime.now(ZoneInfo("America/Sao_Paulo"))


def normalize(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn").strip()


NUMBERS = dict(zip(
    ["zero", "um", "uma", "dois", "duas", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove", "vinte", "trinta", "quarenta", "cinquenta"],
    [0, 1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 14, 15, 16, 17, 18, 19, 20, 30, 40, 50],
))


def parse_number(text: str) -> int | None:
    value = normalize(text)
    if re.search(r"-\s*\d|\d[.,]\d|[/：:]", value):
        return None
    digits = re.search(r"(?<!\d)\d{1,3}(?!\d)", value)
    if digits:
        return int(digits[0])
    words = re.findall(r"\w+", value)
    values = [NUMBERS[word] for word in words if word in NUMBERS]
    return sum(values) if values else None


def parse_date(text: str, reference: datetime) -> date | None:
    value = normalize(text)
    today = reference.date()
    if "depois de amanha" in value:
        return today + timedelta(days=2)
    if "amanha" in value:
        return today + timedelta(days=1)
    if value == "hoje":
        return today
    weekdays = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]
    for index, day in enumerate(weekdays):
        if re.search(rf"\b{day}\b", value):
            delta = (index - today.weekday()) % 7
            if delta == 0 and ("proxim" in value or "que vem" in value):
                delta = 7
            return today + timedelta(days=delta)
    iso = re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)
    numeric = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b", value)
    months = {name: index for index, name in enumerate(["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"], 1)}
    written = re.search(r"\b(\d{1,2})\s+(?:de\s+)?(" + "|".join(months) + r")(?:\s+de\s+(\d{4}))?\b", value)
    try:
        if iso:
            return date.fromisoformat(value)
        if numeric:
            return date(int(numeric[3] or today.year), int(numeric[2]), int(numeric[1]))
        if written:
            return date(int(written[3] or today.year), months[written[2]], int(written[1]))
    except ValueError:
        return None
    return None


def parse_time(text: str) -> str | None:
    value = normalize(text)
    numeric = re.fullmatch(r"(?:as\s+)?([01]?\d|2[0-3])(?:h([0-5]\d)?|:([0-5]\d))?(?:\s*horas?)?", value)
    if numeric:
        return f"{int(numeric[1]):02d}:{numeric[2] or numeric[3] or '00'}"
    if "meio dia" in value or "meio-dia" in value:
        return "12:30" if "meia" in value else "12:00"
    hour = parse_number(value)
    if hour is None or hour > 23:
        return None
    if ("noite" in value or "tarde" in value) and hour < 12:
        hour += 12
    elif hour < 12 and "manha" not in value and not re.search(r"hora|meia", value):
        return None
    return f"{hour:02d}:{'30' if 'meia' in value else '00'}"


def explicit_confirmation(text: str) -> bool:
    value = normalize(text).strip(" .,!💚👍✅")
    return bool(re.fullmatch(r"(?:sim[, ]*)?(?:sim|isso|isso mesmo|pode ser|fechado|confirmo|confirmar(?: o| a)? (?:pedido|reserva|aniversario)|pode confirmar(?: o pedido| a reserva)?|pode fechar(?: o pedido)?|pode pedir)", value))


def declines_confirmation(text: str) -> bool:
    return bool(re.fullmatch(r"(?:nao|ainda nao|nao confirm[eo]|nao confirmar|espera|aguarde)[.! ]*", normalize(text)))


def needs_human(text: str) -> bool:
    if re.search(r"nao (?:recebi|chegou)|nao posso (?:comer|consumir)|nao consigo respirar|sem ar", normalize(text)):
        return True
    # Avaliar por oração evita que "não quero cancelar, quero um atendente" esconda o pedido explícito.
    for clause in re.split(r"[,;.!?]|\bmas\b", normalize(text)):
        if re.search(r"\b(?:nao|nem|sem)\b", clause):
            continue
        if re.search(r"atendente|humano|alguem de verdade|falar com (?:uma pessoa|alguem)|reclam|pedido.*(?:atras|errad)|quero cancelar|preciso cancelar|reembolso|alerg|intoler|passando mal|intoxic", clause):
            return True
    return False


def injection_attempt(text: str) -> bool:
    value = normalize(text)
    return bool(re.search(r"(?:ignore|desconsidere|esqueca).{0,45}(?:instruc|regras|prompt)|(?:system|developer)\s*(?:prompt|message)|(?:azure|openai)_api_key|\bapi[_ -]?key\b|variaveis de ambiente|(?:revele|mostre).{0,35}(?:segredo|chave|prompt)|(?:execute|rode).{0,20}(?:python|shell|codigo|sql)|drop\s+table|(?:burle|ignore).{0,30}(?:preco|estoque|disponibilidade)", value))
