# Gisik Nokma — frequently asked questions

The [manual](manual.md) walks you through using the product start to finish. This is the
other half: the "can I do X?" questions, the odd screens, and the things that look broken and are not.

Answers here say "I don't know" where nobody knows. That is on purpose.

**Jump to:** [Signing in](#signing-in) · [Workspaces and projects](#workspaces-and-projects) ·
[People and roles](#people-and-roles) · [Jobs](#jobs) · [Stages and moves](#stages-and-moves) ·
[Writing, comments and files](#writing-comments-and-files) ·
[Boards, lists and dates](#boards-lists-and-dates) ·
[Being told things](#being-told-things) · [Privacy](#privacy) ·
[Finding things](#finding-things) · [Offline, phone and desktop](#offline-phone-and-desktop) ·
[Time, safety and the state of it](#time-safety-and-the-state-of-it) ·
[Still unknown](#still-unknown)

---

## Signing in

**Where do I type my password?**
Nowhere. This product has no passwords at all and never asks you to make one up. If somebody typed
something for you when they set it up, it was a one-time code or a sign-in link, not a password you
would re-use.

**Why is there no "Phone" option on the sign-in screen?**
Because this deployment has no way to send you a code. Sending an SMS to an Indian number needs a
DLT-registered sender and template, which is a registration rather than a setting, and until that
exists the screen does not offer a tab that cannot work. Sign in with the **Email link**. Where SMS
delivery is configured, the Phone tab appears on its own.

**What's a passkey?**
The fingerprint or face unlock your phone or laptop already does. If you have set that up, it is the
fastest way in. If you have not, ignore the button.

**How long does the emailed sign-in link stay good for?**
Nobody has written that down. Click it fairly soon rather than letting it sit in your inbox for days.

**Somebody could get into my account with that link, couldn't they?**
Yes. That link *is* the key. Treat it like a password reset email — do not forward it and do not paste
it into a group chat. The same goes for invitation links.

**Could somebody set something up on my computer beforehand and hijack my sign-in?**
No. Signing in always issues a completely fresh session of its own rather than adopting whatever was
already sitting there, and the part that keeps you signed in is kept where web pages cannot read it.

**It says "Sign-in failed. Try again." Now what?**
That is the fallback message shown when the server did not explain itself. Usually it means the
address was mistyped, or you are on the Phone tab. Switch to Email link and check the address
carefully.

**The phone number box shows "+91…". Is this India-only?**
That is just the example text in the box. But it points at something real: the whole product runs on
Indian time for everybody. See [Time](#time-safety-and-the-state-of-it).

**Does signing out really sign me out?**
Yes, immediately — the next thing you try on that device is refused straight away, not "at some point
later". That matters if you have signed in on a client's laptop.

**I clicked an invitation link while signed out. Have I lost it?**
No. The product remembers where you were headed and sends you back there after you sign in. That is
true of any link, not just invitations.

---

## Workspaces and projects

**What's the difference between a workspace and a project?**
A workspace is your whole business — everybody in it and all the work underneath. A project is a
bucket of work inside it: "Residential jobs", "Shop operations". Jobs live inside projects.

**Can I create a project?**
**No.** There is no button for it on any screen — not the Workspaces page, not inside a workspace, not
in settings, not in the top bar. This is the biggest hole in the product and it sits right at the
start of the journey. A brand-new workspace has stages, job types and you as its owner, and nowhere to
put a job. Until this is built, ask whoever is setting you up to add a project another way.

**Then how does anybody have projects?**
The ones that exist were put there when a system was set up, not created by somebody clicking.

**Can I have more than one workspace?**
Yes. The Workspaces page lists them all, each with its projects underneath as links.

**Why doesn't clicking the workspace name do anything?**
It is a heading, not a link. Only the project links underneath go anywhere. It catches everybody out
once.

**I only see part of my workspace — the name but no projects.**
If you have been given a limited role, that is deliberate and correct. It does not pretend the
projects do not exist and it does not pretend you have none — it shows you your share.

**Can I rename a workspace later?**
Yes, and the new name appears in everybody's list. Worth knowing: right now *anyone* inside the
workspace can rename it, including the most limited guest. Nobody has decided who should be allowed
to. It is recorded with a name on it and can be changed back, but it is untidy.

**I typed a name that was just spaces and it refused.**
Correct — "A workspace needs a name." Note that it does *not* trim spaces off a real name: type
"  Marak Design  " and that is exactly what gets saved.

**Where's the rest of the menu? I only see three links.**
That is all there is: Workspaces, My Work (only inside a workspace), and Inbox. There are settings
screens for stages and job types, and **nothing anywhere links to them** — they can only be reached by
typing their address. See [Stages and moves](#stages-and-moves).

---

## People and roles

**Does the invitation get sent for me?**
It does not appear to. The Channel dropdown offers email, sms and whatsapp, and nothing was found that
sends by any of them. What happens is that the product makes a link, shows it to you once, and you
send it however you like.

**"Copy it now — it is not stored and cannot be shown again." Does it mean that?**
Absolutely. That link appears once, on that screen, at that moment. It is not in the pending list. It
is nowhere else. Close the tab and you have to withdraw the invitation and start over. **Paste it into
your email before you do anything else.**

**What do I put in the "Projects" box on the invite form?**
Nothing. It asks for a comma-separated list of identifiers — long strings of letters and numbers you
would have to go and find. It is not usable by a person as it stands. Leave it empty.

**Is an admin the same as "sees everything"?**
No, and this surprises everybody. **Admin is a "can change things" role, not a "can see things"
role.** An admin can invite people and set up stages and job types, but only sees the projects they
have personally been put on. If you want somebody to manage the workspace *and* see the work, you have
to do both — one does not come with the other. Only the **owner** automatically sees everything.

**Can I make somebody else an owner, or a co-owner?**
No. "Owner" is never offered in the invitation dropdown, it is refused if forced, and no way was found
to hand ownership over after the fact.

**Can I promote a guest to a member by sending them a new invitation?**
No, and this is a nasty one. The invitation shows as **accepted** and **they stay a guest**. Nothing
warns you and nothing warns them. A wrong answer delivered as a right one.

**Where do I change somebody's role, or take them off?**
Nowhere on screen. The People page lists the people you can see and shows each person's role, but that
role is read-only — no remove, no change role. So you can let people in and see what they are, and you
still cannot put them out. Combined with
the promotion problem above, a workspace's people list can drift out of step with reality with no way
to fix it from the interface.

**If somebody is removed some other way, when does it take effect?**
Immediately, on their very next action — not at some later refresh. If they are only taken off one
project, they lose that project and keep everything else. Their saved settings are kept for about a
month (thirty days, described as a placeholder) in case they come back; re-add them within that window
and their settings come back with them.

**Is there a limit on invitations?**
No. There is currently no cap on how many pending invitations a workspace can have, or how many times
you can invite the same address. That is disclosed as a known gap rather than a decision, so nothing
will stop you sending the same person five invitations by accident.

**Somebody says the invitation link doesn't work.**
They will see: *"This invitation link does not open anything. It may have been used, withdrawn, or
lapsed — ask whoever invited you for a new one."*

That is genuinely all anyone can find out. The product deliberately refuses to say which of the four
it was — never existed, withdrawn, already used, expired — so that nobody can go fishing with random
links. Do not diagnose it. Withdraw and send a fresh one.

**Can two people use the same link?**
No. One link, one person, decided at the moment of acceptance. If three people click it at the same
instant, one gets in and the other two see the dead-link message. (This used to be broken and let all
three in.)

**I withdrew an invitation and the person got in anyway.**
Known. If you withdraw at the exact moment somebody is accepting, they still get in — the invitation
shows as withdrawn and the person is inside. There is no protection against that race yet. If you are
withdrawing something urgently, check the People list afterwards.

**Can a guest see who's in the workspace?**
No. Guests cannot open the people list at all. If a guest is looking at a job somebody else is
assigned to, that person shows as an identifier rather than a name — not blank, just not a name.
Slightly ugly, and better than leaking your staff list to an outsider.

**Can somebody do something under my name?**
No. That is refused outright, even for the owner, and it is checked before anything else.

---

## Jobs

**Can I assign a job to somebody?**
**Yes on the website, no on the apps.** The website's job panel has an "Assignee" picker — choose a
person, or choose **Unassigned** to take the job off somebody. The phone and desktop apps have no
Assignee row at all, so there you can neither see who a job is on nor set it. The board shows who a job
is on, the Inbox tells you when you have been assigned something, My Work is built around it and the
list can group by it.

**Can I set a due date?**
**No control does it.** The calendar and timeline are built entirely around claimed dates and the
"due soon" list depends on them, and nothing offers to claim one.

There is one place that accepts a typed field value, and it will not give you a due date. If an admin
puts a **"Require a field to be set"** rule on one of your moves, the Move dialog puts a plain typing
box on screen for that field and will not let the move through until you fill it in. That is the only
place in the product that takes a field value from a person.

**The built-in due date and start date will not go in that box.** They expect a day *and* an optional
note about it, together, and a single typing box cannot produce that. You get refused with something
like *"Due date needs a day in YYYY-MM-DD form (a note is optional)."*

**A custom date field will**, if you type the day as `2026-08-30`. It shows up as a marker on the
Calendar and Timeline, labelled with your field's name — but a custom date never draws the bar across
the calendar (that still needs the two built-in dates), and the "due soon" list and Inbox message only
ever look at the built-in due date. So it will put a day on a calendar and it will not chase anybody.

Worth knowing about. Not a substitute for a due date.

**Can I rename a job?**
No control was found for it.

**Can I delete a job I created by mistake?**
No delete button or delete action was found anywhere. If your stages have a "won't do" or "cancelled"
stage, moving it there is the nearest thing. Otherwise, assume it stays.

**Can I move a job to a different project?**
No. Parents have to be in the same project, and no way to move a job across projects was found.

**Can I move a job to a different parent after creating it?**
The rules for it exist and are enforced — loops refused, ranks checked, cross-project refused — but no
control on any screen was found that does it. Treat it as "not today".

**Why won't it let me put one job under another?**
A job's type has to be a *smaller* kind of thing than its parent's. Ranks: **1 is the biggest**, bigger
numbers are smaller. A child's rank must be strictly bigger than its parent's. You cannot put an epic
under a story, and you cannot nest two things of the same rank.

**It's demanding a parent for something I want on its own.**
Any type at the very bottom rank must have a parent — that is what the bottom rank means. Use a type
that is not at the bottom for standalone jobs. The message tells you this using your own type's name.

**Can I accidentally make a loop — A under B under A?**
No. Refused, including the clever cases where somebody has changed the ranks around to try to make it
legal.

**What does "5 of 8 done · 2 restricted" mean?**
Five of its eight direct children are finished, and two of the eight are hidden **from you** — not from
everybody. The product gives you the true total and tells you part of it is not yours to see, rather
than quietly showing "5 of 6" and making the job look nearly finished. If nothing is hidden, it does
not print the restricted part at all.

**Does that count grandchildren?**
No — only direct children. Grandchildren count toward whichever job is directly above them.

**A job has no progress number at all.**
It has no children. It shows nothing rather than "0 of 0". Likewise, if moving a job away leaves its
old parent with no children, that parent's progress number disappears rather than showing a fake zero.

**Does the restricted count break down by finished and unfinished?**
Unconfirmed. The total and the restricted count are certain; whether the restricted part is further
broken down is not.

**"Restricted parent — exists, but you can't see it." What is that?**
The job does belong to a bigger job, and you are not allowed to see what that bigger job is — not even
its title. The product deliberately tells you a parent exists rather than letting the job look like it
has none. If a job genuinely has no parent it says **"At project root"** — a different sentence on
purpose. If there is a chain of hidden parents above, you are only told about the one directly above.

**Can I finish a big job while bits of it are still open?**
No. A parent cannot be marked finished while any direct child is still going — whether that child is
not started or in progress, both count as unfinished. This is the one rule above every workflow and it
cannot be turned off. It cascades: a middle job needs its own children settled before it can close,
which is what then frees the job above it.

**What if I need to add work to something I already marked finished?**
It refuses, and then **offers to reopen the finished one for you**. You get a box headed "Reopen
parent?" naming the job and its state, and a picker of the unfinished stages you could reopen it into.
Press "Reopen and proceed" and it reopens the parent first, then files your new job. Cancel submits
nothing.

If half of it works, it tells you both halves: that the parent really was reopened and that is
permanent history, and separately why your job was refused. Nothing is quietly undone.

**What's the "who · when" button on a card?**
Press it and it tells you who moved the job and when: *"marked Doing by Anselma Marak on 19 Aug
2026"*. Every value in the product carries who claimed it and when — nothing is presented as a fact
that just floats there.

**Why does the history show two different times for the same change?**
Both are real and they are two different facts. One is what the person's own device thought the time
was. The other is what the system recorded when it received it. Usually they match closely. When they
do not — a wrong clock, or a change made offline that arrived hours later — you see both, labelled, so
neither misleads you alone.

**Can I see the whole history of a job?**
Up to 200 entries. It says so at the top and there is no way to page further back, so on a long-running
job the earliest history is currently unreachable.

**Two of my staff opened the same job at once. What happens?**
A value that is clearly wrong for its field — text in a number field, an option not on the list — is
refused straight away, naming the field. A genuine race between two people is covered under
[Offline](#offline-phone-and-desktop): later wins, earlier survives in history, nobody is told.

---

## Stages and moves

**How do I mark something done?**
Open the job, press **Move…**, pick the stage, press Move. There is no dragging on the board.

**Why does the picker only show some of the stages?**
Because your workflow decides which moves are allowed. A job can only go where an arrow leads from
where it is. It will not show you a move that would be refused anyway.

**It's asking for a comment before it will let me move.**
Somebody put a "require a comment" rule on that particular move. You cannot skip it, and it will not
accept spaces. The Move button stays greyed out until you type something real.

**It's asking for "Evidence" and there's nothing to attach with.**
That rule means a file must be attached before the move is allowed. The box labelled *"Evidence
(required by this transition)"* takes the file, and the Move button stays greyed out until the upload
has finished and the server has stored it.

**I chose a file and the move is still blocked.**
The server has the last word on what it will keep, and the box tells you what it said — a file over the
size ceiling, or a kind it will not take. The move stays blocked until a file it accepts is attached.

> **Until 2026-09-19 this did not work at all.** The box said *"Evidence upload is not available in this
> build yet"*, and an evidence rule made a move **impossible for everybody** — which is why the docs used
> to tell you not to use one. That is fixed. What remains is the ordinary consequence: a move carrying
> this rule is blocked until somebody attaches a file, so put it only where that is what you mean.

**It won't let *me* make a move, but my colleague can.**
Somebody put a "restrict who may move it" rule on that step, limited to a role, to whoever the job is
assigned to, or to named people. The refusal names who *is* allowed and says you are not among them.
The product does not guess in advance — it shows the option and lets the server answer, so you find out
by trying. Never wrong, occasionally annoying.

**It says I can't approve this because I submitted it.**
The "four eyes" rule: whoever made the earlier move cannot make the approving one. Somebody else has
to. It is cleverer than it looks — if you later reorganise and rename your stages, it still works out
correctly who did what under the old arrangement. And if it genuinely cannot read the history, it
refuses the move rather than waving it through, telling you to ask an admin about the stage history.

**Two refusal messages appeared and they disagree.**
One starts "instant check — " and one starts "Refused by the server — ". The first is your own computer
having a quick guess from what it has locally; the second is the actual answer. When they disagree,
**both stay on screen** rather than one being tidied away.

Confusing the first time. The alternative is worse — your own machine saying "fine" and then the real
answer being no. Read them as "the quick guess" and "the real answer".

**What does it mean when a whole column is marked "Blocked"?**
That is a property of the **stage**, not of any one job. Whoever built your workflow marked that
column as a waiting state — "Waiting on parts", "Waiting on customer". Every job in it is in that
state by definition. **There is no switch you flip on an individual job to say it is stuck**; you need
a stage built for the purpose.

**There's a move that seems to work from any stage.**
Some workflows have a move set up to work from anywhere, normally for "reopen it, whatever state it is
in". If no direct move exists from where your job is, but a from-anywhere move to the same place does,
the product uses it automatically. Its rules are still fully enforced — it is not a back door.

**Somebody changed the stages after my job was created. Which set applies?**
The set your job was pinned to when it was created, not the newest. If a stage it was sitting in gets
removed later, whoever removed it had to say where those jobs go, and yours follows that. If nobody
said, your job refuses to move rather than the product guessing, and it tells you it is stranded.

**Can a regular member edit our workflow?**
No. They get "You can look, not touch — only a workspace owner or admin can change workflows and
ticket types", with no New workflow button and every box switched off. They can look. There is no way
for a non-admin to accidentally publish something.

**Where are the settings screens?**
Nothing links to them. Not in the top bar, not anywhere. The stage builder and the job-type editor can
only be reached by typing their address into the browser. That is a real problem — these are the
screens that make the product yours, and they are invisible. Ask whoever set your workspace up for the
addresses and bookmark them.

**Can I rename "Epic" and "Story" to something that makes sense to me?**
Yes. An admin can rename all four built-in types, change their icons, and change which stage set they
use. What cannot change is where a built-in type sits in the hierarchy — so a renamed sub-task will
still always need a parent. Custom types you create yourself can be re-ranked either way later.

**Do my existing jobs break when I publish a new version of a workflow?**
No. Publishing again makes a new version and jobs created under the old one stay on it unless they are
moved across. If your new version **drops** a stage that jobs are sitting in, publishing stops and
makes you say where each of those jobs goes, showing how many are in each. If it cannot get a count it
says "unavailable" and *still* makes you decide. Leave one out and it names the stage you missed.

**I deleted a stage that was the starting stage. Will it pick a new one for me?**
No, on purpose. Deleting a stage removes every move connected to it, and if it was the starting stage
(or was named by a four-eyes rule) the builder leaves the reference dangling so the problem checker
flags it and makes you fix it — rather than quietly guessing what you meant.

**Do the box positions I drag things into get saved?**
No. Layout is for this session only. Come back tomorrow and it will have laid itself out again. Known
and deliberate for now — do not spend twenty minutes tidying.

**What's the list headed "Worth a look — none of these block publishing"?**
Advice, not errors. Typically: you have put a guard on one route into a stage, but another route in has
no matching guard, so the guard can be walked around. It publishes anyway. The "Errand with waits"
template deliberately trips this twice, because it is modelled on a real shop's real process, warts
included — so do not panic when a template warns about itself.

**My publish was rejected.**
You are shown the exact message the server sent, in its own words. A common cause is somebody else
publishing a newer version of the same workflow while you were still editing yours.

**Why do I have to pick a "Category" for each stage?**
Because the rest of the product needs to know which of your stages mean "finished". That is how it
knows a parent job can be closed, how progress counts work, and what the "Only tickets in progress"
switch filters. Get it wrong and everything downstream guesses wrong, quietly. It is the one bit of
setup where a mistake does damage somewhere else.

**A dropdown field won't save.**
A dropdown needs its list of options, one per line. Without any it is refused. Same if you give
options to a field that is not a dropdown, or reuse a field name.

---

## Writing, comments and files

**How do I write a description for a job?**
Type it into the description on the job screen and save it. It is written the same way everything else
about a job is, so the panel reads back who set it and when, and the job's history keeps a line for
each time it changed.

**Is there a comment box?**
Not on the website. The job screen's writing box now takes a description; it does not post comments,
and nothing on the web lists them.

**The phone app has a Comment button on a job and the website does not.** So the two-screen phone app
can do something the full website cannot. Whichever way round that is meant to be, it is not this way
round.

**Can I attach a photo or a file to a job?**
Not from the website. The upload machinery works and is tested — but nothing on the web job screen
reaches it. The writing box on the job screen is connected now, so you can write a description there;
dropping a file into it is refused rather than quietly lost.

**When it does become reachable, what should I expect?**

> **Nothing in the rest of this answer is available today.** It is here so that you recognise it when
> it arrives, and so that anybody deciding whether to wait for it knows what they are waiting for.
> Do not go looking for any of it on a screen.

Enough is known about the writing box to answer this properly:

- It is proper formatting, not plain text — headings, bold, italic, bullet and numbered lists, quotes.
- It **auto-formats as you type**: a dash becomes a bullet, "1." starts a numbered list, hashes become
  headings, asterisks become bold. About nineteen of these shortcuts.
- When it auto-formats, a small chip appears. **Press Backspace, or click the chip, to undo the
  formatting** and keep your literal characters. **Press Escape and the chip goes away and the
  formatting stays.** Two opposite results, both of which dismiss the chip. Learn the difference.
- **To mention somebody**, type @ and start their name. A list appears — arrows or click to pick,
  Enter to insert, Escape to close and leave what you typed as ordinary text. It will not offer anyone
  without a proper name, and it cannot be tricked into showing one person's name while pointing at
  another.
- **A pasted web address becomes a link. A typed one does not**, and typed markdown-style link syntax
  stays as the characters you typed.
- **A pasted or dragged image** goes inline where you dropped it. **Anything else** goes into the
  attachments list rather than inline — you cannot force a spreadsheet into the middle of a paragraph.
- A progress chip shows while a file uploads and disappears when it is done. If an upload fails, you
  are told and nothing already attached is lost and nothing half-broken is left behind.
- **The largest file accepted is 25 MB**, and one byte over is refused with the limit explained in
  plain megabytes. The product checks the file's actual content, not its name, so renaming something to
  end in ".jpg" will not fool it.
- **Ctrl+Enter (Cmd+Enter on a Mac) submits.** Double-clicking the submit button gives you one comment,
  not two.
- **A refused submission leaves your words exactly where they are.** Only a successful one clears the
  box.
- If you are not allowed to submit, the button is switched off and hovering explains why — rather than
  letting you type something that gets silently thrown away.

**Can I use files from Google Drive?**
There is a Drive picker, and it is noticeably careful:

- It only asks Google for permission to **the one file you pick**, not your whole Drive. Worth saying
  out loud, because people are rightly nervous about that prompt.
- A Drive file is always a **link out**, never embedded in your text — even if it is a picture.
- It shows the name the file had **when you picked it**, and the date you picked it: "captured 20 Aug
  2026".
- **It will only ever describe a Drive file's current state as unknown.** Never "deleted", never
  "missing", never "still fine" — because it genuinely does not know. You might have renamed it, moved
  it, or revoked access since. Do not read silence as proof the file is still there.

Cancel the picker and nothing is attached. If a file you pick has no usable link, it is dropped rather
than an address being invented for it.

**Are uploaded files and Drive links shown differently?**
Yes. An uploaded file is held by the product and links back into it, with the filename right there. A
Drive file links out to Drive and carries all that "last seen" language. Two files with the same name
show as separate rows.

**Can I edit or delete a comment after posting it?**
Unconfirmed. The product keeps a permanent, append-only record of everything, which hints strongly
that editing or deleting after the fact is not the design — but nothing directly confirms it. Treat it
as an open question rather than a no.

---

## Boards, lists and dates

**Why doesn't the "Only tickets in progress" switch change the Board?**
Because it does not narrow the Board — only the List, Calendar and Timeline. There is a note on screen
saying so, and the note is important, because **the Board is the default tab.** So you can turn it on,
read "done are excluded", and be looking at a Done column full of done cards.

**Is that really the only filter?**
Not any more. It was when this answer was written — one switch, and nothing else on any screen. Now
there is a **Filters** button beside it, which opens a sheet that sets an assignee, a collaborator, a
type, a state, closed, and a category, each one either included or excluded; and a **Search the board**
box above the tabs, which narrows the board as you type.

Still connected to nothing: the saved-filters feature — a named filter you can save, pick from a menu
and delete, up to fifty of them, private to you per workspace. There is no menu for it on any screen.
The date-range and custom-field filtering the engine can do has no control either.

**How do I narrow a project down to one person?**
Open the **Filters** button beside the "Only tickets in progress" switch and click **Assignee** — you
get one row per person, with their picture. Click once for *included* (only their jobs), twice for
*excluded* (everything except theirs), and a third time to clear it. It takes effect at once; there is
no Apply. The same sheet sets collaborators, type, state, closed and category the same way, and each one
turns into a removable chip under the tabs. The one exception is **collaborators**: no tab applies it,
and the strip says so on screen rather than pretending otherwise.

**Can I sort a list how I like?**
Not by choosing. Lists come back in a fixed, repeatable order. You can choose the *grouping* (epic,
status, assignee, type, flat) and which columns show, but not a sort order.

**Does grouping hide anything?**
No. Grouping only rearranges. It never hides a row and never changes the counts — the summary at the
top stays the same however you regroup or collapse. Things with nothing to group under get an honest
bucket: "No epic", "Unassigned".

**What's the "default arrangement — you have not arranged this project" note?**
It is telling you that what you are looking at is the default, not something you chose. Once you pick
your own grouping or columns it goes away. If you have only chosen one of the two, it says so about
just that half. Small thing, and it stops you thinking you set something up when you did not.

**Why does the same job appear twice in the list?**
If it is in the "Recently assigned" strip at the top, it also appears in its normal place further
down. That is on purpose.

**Do lists load everything at once?**
They come in pages of fifty with a "load more" that picks up exactly where the last one stopped — no
repeats, no gaps.

**What happens on a really big project?**
There is a ceiling of **2,000 jobs**. Past it the List, Calendar and Timeline all refuse rather than
showing you part of a project pretending to be the whole one — and **the "New ticket" button
disappears too**, because it reads from the same place. So a project that grows past the ceiling
becomes one you cannot add to.

The way out is the "Only tickets in progress" switch, which is deliberately placed where you can
still reach it from the refusing screen. The Board keeps working throughout.

**My calendar is empty. Is it broken?**
Read the sentence — it tells you *which kind* of empty, in four different wordings: nothing in this
month has a claimed date at all ("Undated work is absent, not estimated"); your filter removed
everything; the grouping removed everything; or you switched that date field off with the legend
switch. Four situations, four sentences.

**A job's start date is after its due date and the calendar looks odd.**
It is showing you the contradiction rather than quietly fixing it — two separate markers and no bar
connecting them. That is your cue to go and fix the dates.

**What's the difference between the Calendar and the Timeline?**
The Calendar is a month grid; the Timeline is the same idea stretched sideways over weeks, moving four
weeks at a time. Both draw a bar only when a job has **both** a start and a needed-by claim. On the
Timeline, anything with only one date, no dates, or a contradiction goes into a side list with a
heading saying which of five reasons it is there for.

**Where's the burndown chart? The velocity? Sprint reports?**
There are none, and that is a deliberate decision rather than an oversight — there is a check in the
product that stops those words being added. It will show you what people claimed and when. It will not
forecast anything or score anyone's speed. If you are coming from a tool that had them, they are not
coming.

**Do I have to refresh to see somebody else's changes?**
No. The product keeps a connection open and pushes changes to you. When you connect it first catches
you up on what you missed, tells you you are up to date, then feeds you changes as they happen. If the
connection drops it reconnects on its own and resumes from where it stopped.

**Can I have it open on two machines at once?**
Yes, but only a small number of connections per person. Past that you are told you have too many, and
closing one frees a slot straight away.

**Somebody removed my access while I was looking at the screen. What happens?**
Work you have just lost is actively removed from your screen rather than left there stale. If you are
removed from the whole workspace you are told once and nothing more arrives — you are not told *which*
things you lost, or how many.

---

## Being told things

**Does it email me? Does my phone buzz?**
No and no. **Everything is in-app only.** The only email this product sends is your sign-in link. Push
notifications on the phone app are registered for and there is nothing on the other end to register
with — the app reports the feature as unavailable rather than pretending.

So nobody finds out about anything unless they open the app and look at the Inbox.

**But the People page offers email, sms and whatsapp!**
Those are for **inviting** people to the workspace. They have nothing to do with being told about
work. It is an easy and reasonable thing to misread.

**Can I get a weekly summary email? A digest?**
No. There is no email of any kind beyond sign-in.

**How do I know I've got something new?**
A number badge on the Inbox link. It refreshes about once a minute. If a refresh fails it keeps the
last number rather than resetting to nothing, and it shows nothing at all before the first answer
comes back — an absence, not a zero.

**How do I mark something read?**
Click the row. If the marking fails it reloads to show you the truth rather than leaving a fake "read"
mark.

**Can I mark a lot of them at once?**
Yes — the **Mark N read** button above the list, where N is how many rows on screen are unread. It
marks exactly those, not your whole Inbox, and it is absent when nothing on screen is unread. When it
works you get a message with an **Undo** beside it, which puts back exactly what that one action
changed. The message clears after about fifteen seconds, a second press replaces it and takes the
first one's Undo with it, and a single press carries at most 100 — past that it refuses the whole
thing and says so, rather than marking some of them.

**My "Needs your attention" strip isn't showing.**
If nothing needs attention, the strip does not appear at all — no box, no "all caught up" message,
nothing. That is deliberate: an empty box headed "Needs your attention" reads like an all-clear you did not
earn. A blank space there is the normal way of saying "nothing needs you right now".

**Seven days is too long / too short for us.**
Both numbers — "sitting too long" and "how far ahead counts as due soon" — can be changed by the owner
or an admin, and the lists update to match. Seven days is the default for both, and if nobody has set
them the screen says nobody set them rather than pretending seven was a choice. Blocked is not affected
by either number: blocked is blocked.

**I clicked an Inbox message and the job wouldn't open.**
*"That ticket cannot be opened from here — it may have been removed, or it is no longer visible to you.
The message itself is yours and stays."* That last part matters — the message does not disappear just
because you lost access to what it was about. It was sent to you, so it is yours. The notice clears
itself next time something opens successfully.

**A person's name in a notification shows as a strange code.**
Known limitation, not something wrong with your account. That screen currently shows people by their
raw account identifier rather than looking up the real name, because the piece that would do the
lookup has not been built for it yet.

---

## Privacy

**Can I keep a job private from most of the team?**
Yes. Every job has a "Who can see this" setting with four options: everyone in the workspace, everyone
on the project, only the people you name, or inherited from the parent.

**Does the owner see everything, even the private ones?**
Yes, always — and the screen says so on **every** setting, all the time: *"Visible to: these people —
and the workspace owner, always."* It shows that line even when you have picked "everyone in the
workspace" and even to somebody who cannot change the setting. Showing it only on the private option
would let people assume the other options exclude the owner.

**If I set a big job to "only the people I name", do the smaller jobs under it follow?**
Yes, as long as they are set to inherit. Anything that has set its own audience keeps it, and
everything under that keeps it too. Move a job to a new parent and it takes the new parent's audience,
along with everything under it. Move it to the top and it falls back to the project default. Set it
back to inheriting and it and everything below re-attach.

**What if I accidentally leave myself off the list?**
You get a warning: *"You are about to lose access to this ticket. A project admin — or the workspace
owner, who always sees — can restore it."* **And then it does exactly what you told it to.** It does
not quietly add you back behind the warning — silently adding you would file a claim in your name that
you never made. So read the warning. You cannot apply an empty list; the button stays off.

**Who is allowed to change who sees a job?**
A project admin **of that job's project**, or whoever created the job. Being an admin of a different
project does not help. If you are not one of those, the product will let you fill the form in and the
server will refuse it, saying why.

**Can I see who a job is currently shared with?**
**No — and this is a real gap.** The setting cannot be read back. On the one screen whose entire
subject is who can see what, the current audience shows as unavailable rather than a guess.

Guessing would be much worse, so the behaviour is right and the hole is still real. **Keep your own
note of what you set**, because the screen will not remind you.

**If I share a job with somebody, can they see who else it's shared with?**
No. The job's page does not disclose the list, or which parent it inherited its audience from.

**When I hide something, what does the other person see?**
Nothing. It simply is not there. There is no "you don't have permission" screen for hidden work —
hidden means invisible. If they go looking for it directly they get exactly the same "not found" as a
made-up reference, deliberately identical, so that nobody can work out what exists by watching which
refusals they get. The same is true of a job's history and of trying to change one.

**What can a guest see?**
Only the specific jobs somebody explicitly shared with them. Not the project, not the workspace's
other work. They see the workspace's name and an empty project list — intended, not broken. They can
see a child of something shared with them if that child inherits. They cannot open the people list and
cannot create jobs.

**Can somebody hide who they are?**
No. History always shows who did what and when, untouched, to anybody entitled to see the job — even
when that person shares no project with you. **You can hide the work; you cannot hide who acted.**

---

## Finding things

**Where's the search box?**
There is one on the website now: above the tabs on a project's board, labelled **"Search the board"**,
and it narrows what the board shows you as you type. There is also one on the **phone app's board
screen**. Neither of them is the deep search described below.

**But it can search, surely?**
The machinery is there and it is good. It searches titles, descriptions and comments across every
project in the workspace at once, bolds the matching words in a snippet, ranks title matches above
comment matches, only ever returns things you are allowed to see, and counts its fifty results *after*
removing the hidden ones — so you get fifty things you can actually open, not a padded list.

None of it is reachable. It is a finished engine with no steering wheel bolted on.

**Is there a search anywhere at all?**
Two places, and both of them only narrow something already on screen. On the **phone app's board
screen** — where, offline, it says "searching offline copy" underneath, so you know the results might
be a little out of date. And on the **website's project board**, in the box above the tabs.

Neither of those is the deep search described just above. That one is still on no screen.

**If the deep search worked, what would catch me out?**
Two things:

- **It matches words exactly as typed.** Searching "licences" will not find "licence". No plurals, no
  word-stem cleverness.
- **It does not look inside attached files or images.** A phrase that only exists inside a PDF will
  never be found.

---

## Offline, phone and desktop

**Are there real apps, or is it just a website?**
There is a real desktop app and a real phone app, each keeping its own copy of your work on the
device. They are not just the website in a frame.

But: **the phone app is two screens** — a board and a job. That is the whole app. And **the desktop
app currently tells you to sign in on the website, then paste something across into its settings by
hand.** That is described as a temporary arrangement and it is not something to ask a nervous
colleague to do. Neither app has been tested on an actual phone or an actual computer in the field —
only the pieces underneath have.

**Can I use it on the train with no signal?**
On the phone or desktop app, yes — for reading. You can open the job list, open a job, see the board,
read a job's full history, see the job types and stages, and see your assigned work, all from the copy
on the device.

For changing things, you get whatever the two screens offer, which is not much: create a job, move one
between stages, reopen one, post a comment, deal with a disputed claim. The queue underneath will
carry more kinds of change than that — but **a queue accepting a kind of change is not a screen
offering it**, and offline you still cannot assign anybody or set a due date. **That is a property of
these apps rather than of being offline:** they have no Assignee row in either state. The website's
panel *can* set one, and it is online-only — there is no offline queue there to carry it.

**The browser version is online-only.** It has no offline queue at all — which is why its "claims
waiting to send" section is always empty on the web. Offline is the apps' job.

**Seven things flatly refuse offline** rather than making something up: your list of workspaces, the
people list, the ordinary search, the standard My Work view, the "Needs your attention" strip, and both
reading and saving your preferences. Each names what is missing rather than showing an empty screen.

**I made a job offline and it vanished from the board.**
Expected, and narrow: a job created *entirely* offline — one the server has never seen — will not
appear on the board or the job list until the server confirms it. Search for it by name in the offline
search and it will turn up.

**What does "claim in transit" mean?**
Something you changed that the server has not confirmed yet. It is on its way, not yet locked in. You
get a small badge on that job, both on the board and in job lists, so you always know when you are
looking at something unconfirmed versus something saved for good. The job screen shows your
unconfirmed change alongside the last confirmed version.

**What happens when I get signal back?**
Nothing you have to do. Your changes go up in the order you made them, so a job is never edited on the
server before it has been created there. The status label moves through "Offline — n claims waiting to
send", then "Catching up…", then "Live".

**What if the network fails halfway through sending?**
Treated as temporary. Your change stays queued and is retried with a growing gap between tries — a
second, then two, then four, up to about a minute. It is **never** marked as failed for a network
problem. Only a genuine "no, that breaks a rule" answer is final.

**Two of us edited the same job while I was offline. Who wins?**
It depends which of two things happened, and they are treated very differently.

**A plain race — you both just typed different things.** The later one wins. The earlier one survives
in the job's history. **Nobody is told.** No banner, no warning, no record of a dispute — a race is not
a rule violation.

Be aware of this. If two of you change the same brief while one is on a train, one gets quietly
overwritten and neither of you finds out. The history has it; nobody is going to go looking.

**Your change had become against the rules by the time it arrived** — the job got reassigned, the
stages changed, or it got un-shared from you. Then it is refused, recorded as a **disputed claim**, and
you get a banner.

**What does the disputed-claim banner tell me?**
Who claimed it, what kind of change it was, which rule refused it, that rule's reason in its own words,
and when you made it — in Indian time, like *"21 Aug 2026, 00:00 IST"*.

Three buttons:

1. **Discard it** — throw it away, with an optional short note explaining why.
2. **Convert to comment** — turn what you tried to do into a permanent comment on the job, carrying
   your words, your name, the rule and the time. **Usually the one to use** — the attempt stays on the
   record even though the change did not land.
3. **Redo legally** — send it fresh, properly, linked as the replacement. You cannot just resend the
   rejected one; it would fail the same way.

If there is nothing disputed, the banner is not there at all.

**Does the other person get told my change was refused?**
Generally no. It shows in **your** disputed list and leaves theirs empty. In some situations it reaches
nobody at all.

**Is there a "compare the two versions" screen?**
No. No side-by-side, no merge screen, no "somebody else changed this" review. That banner about your
own refused change is the only conflict surface anywhere in the product.

**If I resolve a disputed claim while still offline, does it count right away?**
No. Resolving one is itself just another queued action. The app is careful not to tell you the server
accepted it until the server actually has.

**Can anything quietly disappear?**
A few named things, and to the product's credit they are written down rather than hidden:

- A very large share is **cut off at 200 jobs**, silently. There is no "there was more" signal.
- If something is shared with you and then restricted again before your device fetches it, it is
  dropped and never fetched again.
- There is one rare, still-open case: if the stages in a workflow change while your device is holding
  old information, reconnecting can sometimes cause an error that does not recover on its own.

What is *not* lost: your queued changes survive closing the app, ordering is kept, and your record of
your own disputed claims survives even being removed from the workspace — because that is the only copy
of it you have.

**My laptop's clock is wrong. Does that matter?**
Your unsent changes carry your device's time until the server accepts them, then the server's own time
takes over. If your clock is ten minutes or more out, a flag appears saying so in plain words: *"device
clock ran 11 min ahead of the server"*. Note the wording — it blames your clock, not the event. Under
ten minutes it shows nothing.

**Do phone notifications work?**
No. The app registers for them and there is nothing to register with. It reports the feature as
unavailable rather than crashing.

**Anything else about the desktop app?**
Its local storage reports being locked, reproducibly, even with nothing else going on. It is measured,
it is written down, and it is not fixed.

---

## Time, safety and the state of it

**I'm not in India. How do dates work?**
**The whole product runs on Indian time, for everybody, everywhere.** A day starts at midnight in
India — not midnight where you are, and not midnight in universal time.

- In London, the product's "today" flips over at about half past six in the evening.
- In Los Angeles, in the late morning.
- A job you file at 11pm your time may already be labelled tomorrow.
- Every due date, every "today" ring on the calendar, and every day boundary means India's day.

The reasoning is that everyone reading the same record sees the same day for the same moment, which is
defensible. If you are running a business in Manchester, "due today" is still going to mean something
odd. The only place in the product that acknowledges this is a footnote at the bottom of a job's
history.

**Is my work backed up?**
Yes. The whole database is copied every night, and a complete export of all recorded activity is taken
once a week. Both really happen on that schedule.

**If I lost everything, how much would I lose?**
Up to about a day. The recovery drill works from a backup no more than a day old.

**Has anybody actually tried restoring one?**
Yes, by hand, more than once — a real backup restored into a scratch copy, accepted only if the record
count matches the original. Doing it found real problems that reading the instructions never would
have: the written recovery steps did not work as written, and the nightly copies were originally
configured to go to the wrong place entirely and would have failed silently from the first night.

That is worth more than "we have backups". Everybody says that.

**If the backups start failing, does anybody find out?**
Not by default, and this is the weak spot. A failure gets written into the service's own log and handed
to a notification destination — and **that destination ships blank**. Unless somebody set it up, a
failing backup is invisible.

There is also a known limit: the weekly export loads the entire history into memory before writing
anything, on a small machine. As the history grows, that is the job that breaks first.

**Could I end up restoring a broken backup by accident?**
Not any more. A copy that died halfway through used to leave a truncated file with a perfectly
normal-looking dated name — indistinguishable from a good one, and exactly what you would grab in a
panic. The broken file now gets deleted.

**Do old files ever get cleaned up?**
Uploaded files that nothing refers to any more are deleted automatically, roughly monthly, and there is
no undo. It is deliberately kept out of the manual "back up now" command, so that reaching for a backup
can never quietly delete things.

**Will I see a "we're doing maintenance" message, or "a new version is available, please refresh"?**
Nothing describes either as existing today.

**Will an update ever kick me out mid-task?**
Nothing describes that as expected behaviour, and nothing records what you would actually see on
screen while the service restarts — whether you reconnect on your own, whether anything half-typed
survives. The live-connection machinery does reconnect by itself, so it probably comes back, but that
is an expectation rather than a promise.

**If something breaks, do I get a technical mess on screen?**
No. One short, plain, generic failure message — never a raw technical error, a file path, or program
code. Genuine refusals ("you can't do that because…") still reach you word for word.

**Am I going to hit "you're doing that too fast"?**
There are limits on how often you can do things. One thing to watch: **uploading files draws on the
same allowance as everything else**, so a burst of uploads temporarily eats into what is left for
ordinary work. Two people on the same office wifi get separate allowances rather than sharing one.
Nobody has written down what the message actually says when you hit it.

**How do I tell somebody which version I'm using?**
You cannot. There is no version number, badge or marker anywhere a regular user would see — not in a
footer, a tab title, or a settings page.

**Is there a "report a problem" button?**
No. There is no feedback button, no "beta" marker, and nothing on screen identifying this as a trial.

**Does the team actually use this themselves?**
Yes, and properly. Twenty-three real errands from a real shop's own operations tracker are loaded in,
plus the product's own build plans as projects and jobs.

The loading is careful in a way that says something: it refuses to run at all if the owner has never
signed in, so no person is invented. It refuses anything marked finished, so it never claims work was
done on somebody's behalf. It claims no start date it does not actually have. It attaches a note to
every due date saying where the date came from. And running it twice does nothing rather than
duplicating everything.

That is a team that means it about not inventing facts, and it shows up everywhere else in the product.

---

## Still unknown

Honest blanks. Nobody has an answer to these yet, and none of them is invented here.

- **How long an emailed sign-in link stays valid.** Not written down anywhere.
- **Whether a job can be deleted.** No delete control was found. Whether one exists somewhere is
  unconfirmed.
- **Whether a job can be moved to a different project.** No evidence either way.
- **Whether a comment or description can be edited or deleted after posting.** The append-only design
  hints not; nothing confirms it.
- **Whether the restricted-children count breaks down by finished and unfinished**, or is a raw total.
- **What you see on screen the moment your connection drops on the website**, as opposed to the apps —
  a message, a freeze, or silence.
- **What a live update looks like when it arrives** — whether a card moves, flashes, or shows a badge.
- **What happens on your screen while the service is restarting** — whether you reconnect on your own
  and whether half-typed work survives.
- **What the "you're doing that too fast" message actually says.**
- **Whether a comment posted from the phone app is attributed to you** or to a stand-in identity —
  worth checking before promising anybody their name appears on their mobile comments.
