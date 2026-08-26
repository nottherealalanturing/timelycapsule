#!/usr/bin/env python3
"""Character-count gate for the 2026-08-25 marketing copy. X bio <=160,
IG bio <=150, every X post <=280. Run, read the report, tighten anything
flagged, rerun. Source of truth for the counts stated in COPY.md."""

X_BIO = "A letter that arrives exactly when you choose, and not a day sooner. Sealed on your device — unreadable here too."

IG_BIO = "Letters that arrive exactly when you choose — next month, or 2041.\nSealed on your device. Unreadable until the date says so."

PINNED_X = "A letter that cannot be read yet is still a letter.\n\nTimelyCapsule keeps it: sealed on the device that wrote it, unreadable to anyone else, including this account, until the date you chose.\n\nNothing arrives early. Nothing arrives late."

X_POSTS = {
    "1 mark": "A vertical line, broken once.\n\nThe gap is exactly as wide as the marker approaching it. Not empty space — a place already reserved.\n\nThe marker never crosses it. It holds at half distance. Permanently.",
    "2 dual clock": "Most software shows what's left. This also shows what already passed.\n\nElapsed and remaining, equal weight, side by side. A progress bar says how much is left. This says how far it's come.",
    "3 decade": "Ten years is 3,653 days.\n\nA calendar makes that feel small. A decade never does. That's the whole argument for choosing the date before writing a word.",
    "4 composer": "The composer opens with one dismissible question, then gets out of the way entirely.\n\nNo templates, no suggested phrasing. Writing it for you would defeat the point.",
    "5 sealing": "Before a letter seals, it can gather what belongs with it: a photo, a voice note, the coordinates of where it was written.\n\nRead it back once. Seal it. That's the last edit it ever gets.",
    "6 waiting": "This is what ten years of custody looks like on an ordinary Tuesday: a line of text and two numbers.\n\nNo notification. No nudge. A sealed letter needs to be left alone.",
    "7 reveal": "Nothing crossfades here. The screen empties out, sits in that emptiness for a beat, and only then does paper show up.\n\nA crossfade would suggest the screen simply changed state. This is meant to feel like arrival.",
    "8 replies": "Opening a capsule isn't the end of the exchange.\n\nWhoever receives it can answer back, sealed under the identical encryption the letter travelled in. Less a thread, more a second letter.",
    "9 one reading": "Some letters aren't built to last.\n\nMark one “one reading only” and it survives exactly one open before it's gone for good — no backup, no trace, anywhere.",
    "10 refusals": "A partial list of what this will not have:\n\nNo streaks. No badges. No progress bar. No preview of anything sealed. No urgency — the only clock is the one you set. No confetti. No sound at a reveal.",
    "11 kept": "One word carries the whole thing, and English gives it away for free.\n\nKept time. Kept safe. Kept its word. A keepsake.\n\nFour meanings, one word, no strain.",
}

IG_CAPTIONS = {
    "1 mark": "A vertical reference, broken once.\n\nThe break is exactly the width of the marker approaching it. The gap is not a gap — it is a place that has been kept.\n\nThe marker never arrives in the mark. It is held at half distance, permanently.",
    "2 dual clock": "Almost nothing in software shows you what has already passed.\n\nElapsed and remaining, weighted equally, always together. A progress bar tells you how much is left and implies the rest was waiting around for you. This says how far it has come.\n\nIt converts a countdown into a journey. It is on every screen, which is why it carries more of this brand than the mark does.",
    "3 decade": "Ten years is 3,653 days. A person can hold about three of them in mind at once.\n\nThat gap — between the number and the felt length — is the reason a letter arriving in 2036 will land differently than one arriving on Friday. Nothing about the letter changes. The distance does the work.\n\nChoose the date first. The writing gets easier once the distance is real.",
    "4 composer": "The blank page is the real problem here.\n\nThe composer asks exactly one question — “what do you want your future self to know that you might not say out loud” — dismissible, never inserted into the letter itself, and then it gets out of the way.\n\nNo templates, and there will not be any. A template writes the company's words. A question writes yours.",
    "5 sealing": "A letter can carry more than words.\n\nA photo. A voice note, recorded and reviewed before it's kept. The place it was written, if that matters to the story. All of it travels inside the same seal as the letter itself.\n\nThen: read it once more. After sealing, nothing inside can change — not the words, not what's attached, not by you and not by anyone else.",
    "6 waiting": "This is what a decade of custody looks like on a Tuesday.\n\nNothing is happening, and that is the entire design brief. A sealed letter does not need tending, does not decay if ignored, and produces no notifications asking you to come back.\n\nThe test this screen has to pass: if a capsule sitting untouched for three years reads as empty instead of kept, the design has failed. It doesn't.",
    "7 reveal": "On the day, the instrument gives way to the letter.\n\nThe screen goes dark first. Holds there for a beat — long enough to notice. Then paper. Never a crossfade, because a crossfade says the screen changed. This says something arrived.\n\nIt's skippable at any point. Whoever is waiting on the other end gets the letter the moment they want it, not the moment the animation allows.",
    "8 replies": "The letter does not have to be the last word.\n\nOnce a capsule opens, the person who received it can write back — encrypted exactly the same way the original letter was, so the reply is exactly as unreadable to everyone who isn't supposed to read it.\n\nNot a message thread. A second letter, answering the first.",
    "9 one reading": "Not every letter is meant to be kept forever.\n\nChoose “one reading only,” and the record is destroyed the moment it has been read — not archived, not soft-deleted, not sitting in a backup somewhere. There is no copy. Not one, anywhere, including here.\n\nThis is real, verified behavior, not a line in a settings screen nobody checked.",
    "10 refusals": "A partial list of things this product will never have.\n\nNo streaks. No badges. No “on this day.” No preview of anything sealed, anywhere, including internally. No progress bar. No confetti. No urgency of any kind — the only clock is the one you set. No sound at a reveal, because a reveal might happen somewhere quiet and there is no way to know that in advance.\n\nA list of refusals is a more reliable description of a product than a list of features. Features arrive. Refusals have to be held.",
    "11 kept": "One word carries the whole thing, and English gives it away for free.\n\nKept time — the horological term. A chronometer keeps time.\nKept safe — the record is kept, not merely stored.\nKept its word — the promise, and the reason any of the rest matters.\nA keepsake — what the recipient is left holding.\n\nFour meanings, one word, no strain.",
}

def report():
    print(f"X bio: {len(X_BIO)}/160")
    print(f"IG bio: {len(IG_BIO)}/150")
    print(f"Pinned (X): {len(PINNED_X)}/280")
    print()
    print("-- X posts (limit 280) --")
    for k, v in X_POSTS.items():
        flag = "  OVER!" if len(v) > 280 else ""
        print(f"{k}: {len(v)}/280{flag}")
    print()
    print("-- IG captions (soft target ~2200 max, no hard limit) --")
    for k, v in IG_CAPTIONS.items():
        flag = "  OVER!" if len(v) > 2200 else ""
        print(f"{k}: {len(v)}{flag}")

if __name__ == "__main__":
    report()
