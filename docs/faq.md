# Gisik Nokma — frequently asked questions

The [manual](manual.md) walks you through using the product start to finish. This is the
other half: the "can I do X?" questions, the odd screens, and the things that look broken and are not.

Answers here say "I don't know" where nobody knows. That is on purpose.

**Jump to:** [Signing in](#signing-in) · [Workspaces and projects](#workspaces-and-projects) ·
[People and roles](#people-and-roles) · [Tickets](#tickets) · [States and moves](#states-and-moves) ·
[Writing, comments and files](#writing-comments-and-files) · [Notes](#notes) ·
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
address was mistyped. Where the Phone tab is offered, it can also mean you are on it rather than on
Email link. Check the address carefully either way.

**The phone number box shows "+91…". Is this India-only?**
Where the Phone tab is offered, that is just the example text in the box. But it points at something
real: the whole product runs on Indian time for everybody. See
[Time](#time-safety-and-the-state-of-it).

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
bucket of work inside it: "Residential repairs", "Shop operations". Tickets live inside projects.

**Can I create a project?**
**Only if you are an owner or an admin.** Those two roles get a **Create project** button on the
workspace page; everybody else gets a sentence saying so instead of a button that fails: *"Only an owner
or admin can create a project."* For anyone, there is no button on the Workspaces page, in
settings, or in the top bar. A brand-new workspace has states, ticket types and you as its owner, and
nowhere to put a ticket until an owner or admin adds one. For a member this is still the biggest hole in
the product, and it sits right at the start of the journey.

**Then how does anybody have projects?**
An owner or admin creates one, with the **Create project** button on the workspace page. Any that were
already there when you arrived were put there when the system was set up.

**Where do I create a workspace, a project or a ticket?**
Each has a button that says **Create**; the ones in the page headers are bright, with a plus sign. **Create workspace**
is at the top of the Workspaces page. **Create project** is on a workspace's page, in the Projects
heading row — owners and admins only. **Create ticket** is in a project, near the top by the view tabs,
on a project's empty Board and inside an empty column on the Board. **Create project** also takes an optional
group, and one press never makes more than one project. Each opens a window; nothing is made until you press the button
inside it.

**Can I change a project's prefix, or the workspace's?**
Yes, if you are an owner or an admin. For a project, press **Edit** on its card or page, change
**Prefix** and press **Save**. For the workspace, press **Edit prefix** under its name. Either way you
are asked first, in a window called **Change prefix**, and the cursor starts on the safe answer, **Keep**.
A prefix is one to three letters.

**What happens to the old ticket numbers when a prefix changes?**
Every ticket's number is rewritten at once: **CCSO-12** becomes **CCSH-12** when the project goes from **SO**
to **SH**, with the same count. The old number still finds the ticket — in the picker that links a ticket into
a note, and in your assistant's search — and puts it first. A note that mentioned **CCSO-12** keeps saying
**CCSO-12**, and the mention still opens the ticket.

**Why can't I use a prefix a project used to have?**
Because the old numbers still point at that project. Once a project has moved off **SO**, no other project
in the workspace can take it, so one number never names two tickets. The project that gave it up can take it
back. A prefix another project uses right now is refused too. The form shows the reason and stays open.

**Can my assistant change a prefix?**
No. It can read and search by ticket numbers, but changing a prefix is done in the app by an owner or admin.

**How do I put my projects into groups?**
An owner or admin presses **Edit** on a project and uses **Group (optional)**: four boxes, **Level 1
group** to **Level 4 group**, each listing only the groups under the one above. Type a name that does not
exist yet and **Create “…”** makes it. The whole tree is also built and tidied under **Settings → Groups**:
add a group, rename it by clicking its name, reorder it by dragging (or **Alt** with the arrow keys), or
delete it once it holds no project and no sub-group.

**What are Grouped and Plain on the workspace page?**
**Show projects** switches between them. **Grouped** draws the groups as nested sections with a coloured
strip naming each level, and the projects that have no group last under **Ungrouped**; **Plain** is the
flat grid. The page remembers your choice, for you, in each workspace. Guests are not offered it.

**Can I have more than one workspace?**
Yes. The Workspaces page lists them all, each with its projects underneath as links.

**Why doesn't clicking the workspace name do anything?**
It is a heading, not a link. Only the project links underneath go anywhere. It catches everybody out
once.

**I only see part of my workspace — the name but no projects.**
If you have been given a limited role, that is deliberate and correct. It does not pretend the
projects do not exist and it does not pretend you have none — it shows you your share.

**Can I rename a workspace later?**
Yes, and the new name appears in everybody's list. Only an owner or admin can: on the workspace's home
page they see a pencil button (**Rename** plus the workspace's name) beside the heading, and pressing the
name does the same. A member or a guest is not shown either, and the product refuses their rename with
*"Only a workspace owner or admin can rename a workspace."* The change is recorded with a name on it and
can be changed back.

**I typed a name that was just spaces and it refused.**
Correct — "A workspace needs a name." Note that it does *not* trim spaces off a real name: type
"  Marak Design  " and that is exactly what gets saved.

**Where's the rest of the menu? I only see a few links.**
The bar is short on purpose, and what it carries depends on where you are. Signed out it offers
**Workspaces**, **Help** and **Account**; once a workspace is open, **My work**, **Members** and
**Settings** join them, with the workspace's name and your inbox and avatar at the right-hand end. The
settings screens for states and ticket types are behind **Settings**. See
[States and moves](#states-and-moves).

On a phone, a tablet or any window up to about 1024 pixels wide the links are in a **bar along the
bottom** instead, with **More** at its right-hand end holding the rest, plus **Settings**, **Account** and
**Help**. **Edit bottom bar**, the last row of **More**, lets you choose what the bar carries. Unlike the
top bar, it offers **My work** even with no workspace open, because My work covers every workspace you are in.

---

## People and roles

**Does the invitation get sent for me?**
**By email, yes.** Pick **email** and the product sends it, and the screen tells you whether it went. **Phone (SMS)** is not sent for you: copy the link and send it yourself.

**"Copy it now: it is not stored and cannot be shown again." Does it mean that?**
Absolutely. That link appears once, on that screen, at that moment. It is not in the pending list. It
is nowhere else. Close the tab and you have to withdraw the invitation and start over. **Paste it into
your email before you do anything else.**

**What do I put in the "Project access" box on the invite form?**
Nothing: the box was removed on 29 September 2026. Admins and members see every project in the workspace.

**Is an admin the same as "sees everything"?**
**Close to it.** Since 29 September 2026 an admin, like every member, sees every project in the workspace. What they still do not see is a ticket shared with only named people who are not them, unless it is assigned to them. Only the owner sees every one of those.

**Can I assign a ticket to somebody who is not in the workspace?**
Yes. In the **Assignee** picker choose **Assign someone outside this workspace…**, type their exact email and press **Find**. If an account has that email you can press **Assign**, and they join as a guest who sees only that ticket; nothing is listed or suggested, so you have to know the email.

**Can I make somebody else an owner, or a co-owner?**
No. "Owner" is never offered in the invitation dropdown, it is refused if forced, and no way was found
to hand ownership over after the fact.

**Can I promote a guest to a member by sending them a new invitation?**
No, and this is a nasty one. The invitation shows as **accepted** and **they stay a guest**. Nothing
warns you and nothing warns them. A wrong answer delivered as a right one.

**Where do I change somebody's role, or take them off?**
Both are on screen, for an owner or admin. The People page lists the people you can see and shows each
person's role; an admin gets a **Role** picker on every row except an owner's, and **Remove from
workspace…** on every row except their own and the only owner's. Removing asks you to confirm, and then
the person loses access at once; their history stays, tickets stay assigned to them marked "(removed)",
and any invitation still pending for them is withdrawn. If the workspace refuses (an admin cannot remove
an owner), the page shows its reason.

**When does a removal take effect?**
Immediately, on their very next action — not at some later refresh. If they are only taken off one
project, they lose that project and keep everything else. Their saved settings are kept for about a
month (thirty days, described as a placeholder) in case they come back; re-add them within that window
and their settings come back with them.

**Is there a limit on invitations?**
No. There is currently no cap on how many pending invitations a workspace can have. That is disclosed as
a known gap rather than a decision. Inviting the SAME address again does not stack invitations, though:
with the same role and projects it re-sends the pending invitation with a fresh link, and with a different
role or projects it replaces the pending invitation with one carrying the new role and projects. Either way
the older link stops working.

**Somebody says the invitation link doesn't work.**
They will see: *"This invitation link does not open anything. It may have been used, withdrawn, or
lapsed. Ask whoever invited you for a new one."* The page is headed **This invitation can't be used** and
has a **Go to sign in** button (and **See your workspaces** if they are already signed in).

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
No. Guests cannot open the people list at all. If a guest is looking at a ticket somebody else is
assigned to, that person shows as an identifier rather than a name — not blank, just not a name.
Slightly ugly, and better than leaking your staff list to an outsider.

**Can somebody do something under my name?**
No. That is refused outright, even for the owner, and it is checked before anything else.

---

## Tickets

**Can I assign a ticket to somebody?**
**Yes on the website, no on the apps.** The website's ticket panel has an "Assignee" picker — choose a
person, or choose **Unassigned** to take the ticket off somebody. The phone and desktop apps have no
Assignee row at all, so there you can neither see who a ticket is on nor set it. The board shows who a ticket
is on, the Inbox tells you when you have been assigned something, My work is built around it and the
list can group by it.

**Can I set a due date?**
**Yes — on the website's ticket panel.** Open a ticket and its **Due** row is a date box: pick a day and it
is claimed under your name, with the row reading back who set it and when. **Clear the box to take the
claim off** — that is recorded as a clearing rather than as a blank date. The calendar, the timeline,
the list's due column and the "due soon" notice all read the same claim, so the date you set here is
the date those screens show.

There is also a place that accepts a TYPED field value, and it works differently. If an admin puts a
**"Require a field to be set"** rule on one of your moves, the Move dialog puts a plain typing box on
screen for that field and will not let the move through until you fill it in.

**The built-in due date and start date will not go in that box.** They expect a day *and* an optional
note about it, together, and a single typing box cannot produce that. You get refused with something
like *"Due date needs a day in YYYY-MM-DD form (a note is optional)."*

**A custom date field will**, if you type the day as `2026-08-30`. It shows up as a marker on the
Calendar and Timeline, labelled with your field's name — but a custom date never draws the bar across
the calendar (that still needs the two built-in dates), and the "due soon" list and Inbox message only
ever look at the built-in due date. So it will put a day on a calendar and it will not chase anybody.

Worth knowing about — but it is no longer the only way to put a date on a calendar, and it is not how
you set the built-in due date.

**Can I set the dates when I create the ticket, instead of afterwards?**
Yes. The Create ticket window has its own **Start date** and **Due date** boxes — real date pickers, empty
by default, not the typing box above. Leave either blank to create the ticket with no claim on that date.

**Can I choose which state a new ticket starts in?**
Yes, if your workflow allows it. The Create ticket window has a **Starting status** picker, defaulting to
the workflow's first state; it is disabled while **Starts in the backlog?** is on, since a backlog ticket
has no starting state yet. A state your admin marked as not allowing new tickets is never offered.

**Can I rename a ticket?**
Yes. Open the ticket and type into the title at the top of the sheet. **Enter** or clicking away saves it;
**Escape** abandons the change.

**Can I delete a ticket I created by mistake?**
Yes, if you are a project admin. Open the ticket and press **Delete** in the sheet's footer, then confirm.
The ticket stops appearing in every view — boards, lists, search, My work — and its history is kept,
because other events cite it. An **Undo** follows for about fifteen seconds, and after that the ticket is
still under **Deleted items** on your Account page, where **Restore** brings it back. Turning on
**Delete permanently** in the confirmation also marks it to be erased for good after the waiting period
the confirmation states; **Unmark** in Deleted items takes that back until then. If you would rather
not lose it at all, a "won't do" or "cancelled" state in your workflow remains the alternative.

**Can I move a ticket to a different project?**
No. Parents have to be in the same project, and no way to move a ticket across projects was found.

**Can I move a ticket to a different parent after creating it?**
The rules for it exist and are enforced — loops refused, ranks checked, cross-project refused — but no
control on any screen was found that does it. Treat it as "not today".

**Why won't it let me put one ticket under another?**
A ticket's type has to be a *smaller* kind of thing than its parent's. Ranks: **1 is the biggest**, bigger
numbers are smaller. A child's rank must be strictly bigger than its parent's. You cannot put an epic
under a story, and you cannot nest two things of the same rank.

**It's demanding a parent for something I want on its own.**
Any type at the very bottom rank must have a parent — that is what the bottom rank means. Use a type
that is not at the bottom for standalone tickets. The message tells you this using your own type's name.

**Can I accidentally make a loop — A under B under A?**
No. Refused, including the clever cases where somebody has changed the ranks around to try to make it
legal.

**What does "5 of 8 done, 2 restricted" mean?**
Five of its eight direct children are finished, and two of the eight are hidden **from you** — not from
everybody. The product gives you the true total and tells you part of it is not yours to see, rather
than quietly showing "5 of 6" and making the ticket look nearly finished. If nothing is hidden, it does
not print the restricted part at all.

**Does that count grandchildren?**
No — only direct children. Grandchildren count toward whichever ticket is directly above them.

**A ticket has no progress number at all.**
It has no children. It shows nothing rather than "0 of 0". Likewise, if moving a ticket away leaves its
old parent with no children, that parent's progress number disappears rather than showing a fake zero.

**Does the restricted count break down by finished and unfinished?**
Unconfirmed. The total and the restricted count are certain; whether the restricted part is further
broken down is not.

**What does "Restricted parent: it exists, but you can't see it" mean?**
The ticket does belong to a bigger ticket, and you are not allowed to see what that bigger ticket is — not even
its title. The product deliberately tells you a parent exists rather than letting the ticket look like it
has none. If a ticket genuinely has no parent it says **"At project root"** — a different sentence on
purpose. If there is a chain of hidden parents above, you are only told about the one directly above.

**Can I finish a big ticket while bits of it are still open?**
No. A parent cannot be marked finished while any direct child is still going — whether that child is
not started or in progress, both count as unfinished. This is the one rule above every workflow and it
cannot be turned off. It cascades: a middle ticket needs its own children settled before it can close,
which is what then frees the ticket above it.

**What if I need to add work to something I already marked finished?**
It refuses, and then **offers to reopen the finished one for you**. You get a box headed "Reopen
parent?" naming the ticket and its state, and a picker of the unfinished states you could reopen it into.
Press "Reopen and proceed" and it reopens the parent first, then files your new ticket. Cancel submits
nothing.

If half of it works, it tells you both halves: that the parent really was reopened and that is
permanent history, and separately why your ticket was refused. Nothing is quietly undone.

**Why do I only see one column of the board on my phone?**
That is how the board works on a phone: one column at a time, chosen from the row of buttons above it
(each shows how many cards are in it). There is no sideways swiping. If a move needs a comment or is
refused, the board shows the column the card is in until you close the box, then returns to yours.

**What's the line at the bottom of a card?**
It says what happened last, in words: *"Moved to Doing by Anselma Marak on 19 Aug"*. Press it and it adds
the year; press it again and it folds back. A move from an earlier year always shows its year. Every value in the product carries who claimed it and when — nothing is presented as a fact
that just floats there.

**Why does the history show two different times for the same change?**
Both are real and they are two different facts. One is what the person's own device thought the time
was. The other is what the system recorded when it received it. Usually they match closely. When they
do not — a wrong clock, or a change made offline that arrived hours later — you see both, labelled, so
neither misleads you alone.

**Can I see the whole history of a ticket?**
Up to 200 entries. It says so at the top and there is no way to page further back, so on a long-running
ticket the earliest history is currently unreachable.

**Two of my staff opened the same ticket at once. What happens?**
A value that is clearly wrong for its field — text in a number field, an option not on the list — is
refused straight away, naming the field. A genuine race between two people is covered under
[Offline](#offline-phone-and-desktop): later wins, earlier survives in history, nobody is told.

---

## States and moves

**How do I mark something done?**
Drag the card to a column, press the **‹** or **›** arrow on the card, or open the ticket, press
**Move…**, pick the state, press Move.

**Why does the picker only show some of the states?**
Because your workflow decides which moves are allowed. A ticket can only go where an arrow leads from
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
Somebody put a "restrict who may move it" rule on that step, limited to a role, to whoever the ticket is
assigned to, or to named people. The refusal names who *is* allowed and says you are not among them.
The product does not guess in advance — it shows the option and lets the server answer, so you find out
by trying. Never wrong, occasionally annoying.

**It says I can't approve this because I submitted it.**
The "four eyes" rule: whoever made the earlier move cannot make the approving one. Somebody else has
to. It is cleverer than it looks — if you later reorganise and rename your states, it still works out
correctly who did what under the old arrangement. And if it genuinely cannot read the history, it
refuses the move rather than waving it through, telling you to ask an admin about the state history.

**Two refusal messages appeared and they disagree.**
One starts "instant check: " and one starts "Refused by the server: ". The first is your own computer
having a quick guess from what it has locally; the second is the actual answer. When they disagree,
**both stay on screen** rather than one being tidied away.

Confusing the first time. The alternative is worse — your own machine saying "fine" and then the real
answer being no. Read them as "the quick guess" and "the real answer".

**What does it mean when a whole column is marked "Blocked"?**
That is a property of the **state**, not of any one ticket. Whoever built your workflow marked that
column as a waiting state — "Waiting on parts", "Waiting on customer". Every ticket in it is in that
state by definition. **There is no switch you flip on an individual ticket to say it is stuck**; you need
a state built for the purpose.

**There's a move that seems to work from any state.**
Some workflows have a move set up to work from anywhere, normally for "reopen it, whatever state it is
in". If no direct move exists from where your ticket is, but a from-anywhere move to the same place does,
the product uses it automatically. Its rules are still fully enforced — it is not a back door.

**Somebody changed the states after my ticket was created. Which set applies?**
The set your ticket was pinned to when it was created, not the newest. If a state it was sitting in gets
removed later, whoever removed it had to say where those tickets go, and yours follows that. If nobody
said, your ticket refuses to move rather than the product guessing, and it tells you it is stranded.

**Can a regular member edit our workflow?**
No. They get "You can look, but not change anything. Only a workspace owner or admin can change workflows and
ticket types", with no New workflow button and every box switched off. They can look. There is no way
for a non-admin to accidentally publish something.

**Where are the settings screens?**
In the top bar: **Settings**. It appears once a workspace is open, and it opens that workspace's own
screens — ticket types, workflows, and the workspace itself — where the workflow editor and the ticket-type
editor live. Nothing to bookmark.

**Can I rename "Epic" and "Story" to something that makes sense to me?**
Yes. An admin can rename all four built-in types, change their icons, and change which workflow they
use. What cannot change is where a built-in type sits in the hierarchy — so a renamed sub-task will
still always need a parent. Custom types you create yourself can be re-ranked either way later.

**Can I put my ticket types in a different order?**
Your own types, yes: each one has a **Reorder** button with **Move up**, **Move down** and **Move to top**
(an item that cannot apply is greyed out and says why). The four built-in types have no such button — they
keep their rank.

**Do my existing tickets break when I publish a new version of a workflow?**
No. Publishing again makes a new version and tickets created under the old one stay on it unless they are
moved across. If your new version **drops** a state that tickets are sitting in, publishing stops and
makes you say where each of those tickets goes, showing how many are in each. If it cannot get a count it
says "unavailable" and *still* makes you decide. Leave one out and it names the state you missed.

**I deleted a state that was the starting state. Will it pick a new one for me?**
No, on purpose. Deleting a state removes every move connected to it, and if it was the starting state
(or was named by a four-eyes rule) the builder leaves the reference dangling so the problem checker
flags it and makes you fix it — rather than quietly guessing what you meant.

**Do the box positions I drag things into get saved?**
No. Layout is for this session only. Come back tomorrow and it will have laid itself out again. Known
and deliberate for now — do not spend twenty minutes tidying.

**What's the list headed "Worth a look (none of these block publishing)"?**
Advice, not errors. Typically: you have put a guard on one route into a state, but another route in has
no matching guard, so the guard can be walked around. It publishes anyway. The "Errand with waits"
template deliberately trips this twice, because it is modelled on a real shop's real process, warts
included — so do not panic when a template warns about itself.

**My publish was rejected.**
You are shown the exact message the server sent, in its own words. A common cause is somebody else
publishing a newer version of the same workflow while you were still editing yours.

**Why do I have to pick a "Category" for each state?**
Because the rest of the product needs to know which of your states mean "finished". That is how it
knows a parent ticket can be closed, how progress counts work, and what the "Only tickets in progress"
switch filters. Get it wrong and everything downstream guesses wrong, quietly. It is the one bit of
setup where a mistake does damage somewhere else.

**A dropdown field won't save.**
A dropdown needs its list of options, one per line. Without any it is refused. Same if you give
options to a field that is not a dropdown, or reuse a field name.

---

## Writing, comments and files

**How do I write a description for a ticket?**
Type it into the description on the ticket screen and save it. It is written the same way everything else
about a ticket is, so the panel reads back who set it and when, and the ticket's history keeps a line for
each time it changed.

**Is there a comment box?**
Yes, on a ticket. The ticket screen ends with the ticket's comments and a box under them: what you post is
recorded against the ticket as an event citing you, so the thread reads back who wrote each comment and
when. You can mention somebody by typing `@` — the mention is recorded on the comment and tells them,
if they can see the ticket.

**There is a second comment box on the website, and it belongs to a Move:** if the move carries a
"require a comment" rule, its dialog takes one, and what you type is recorded on the move.

**It used to be that the phone app had a Comment button on a ticket and the website did not.** That is
settled — the website has one now, and the two record the same thing.

**Can I attach a photo or a file to a ticket?**
Through a comment, and the file travels with the comment that carries it. Drop an image into the comment
box, paste it, or press the paperclip **Attach** button in the comment box's own footer, and it is
stored and put inside what you are writing; the comment then names it, and the chip under the comment
is how you reach it. **A file that is not an image cannot be put inside a comment** — it is stored
against the ticket instead and appears in the ticket's list of files, not in your comment. That split is the
product's own rule rather than a limitation of the box: a comment's files are the ones its own text
carries, so a comment can never be missing a file it was written with. The **Attachments** tab has its
own **Attach a file** button too, for a file that has no comment to travel with.

**A file can also be attached to a Move:** a move carrying the "require evidence" rule puts a file box
in its dialog and stays blocked until the server has stored the file.

**When it does become reachable, what should I expect?**

> **Nothing in the rest of this answer is available today.** It is here so that you recognise it when
> it arrives, and so that anybody deciding whether to wait for it knows what they are waiting for.
> Do not go looking for any of it on a screen.

Enough is known about the writing box to answer this properly:

- It is proper formatting, not plain text — headings, bold, italic, bullet and numbered lists, quotes.
- It **auto-formats as you type**: a dash becomes a bullet, "1." starts a numbered list, hashes become
  headings, asterisks become bold. About nineteen of these shortcuts.
- If a shortcut fires when you did not want it, **press Backspace straight away** — the formatting
  goes and the characters you typed (the hashes, dashes, backticks) come back as plain text. It works
  only for the very next keypress; once you type anything else, the formatting stays.
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

**How do I change a link I already wrote — its address, its words, or take it off?**
Click into the link's text. A small panel appears next to it with the **URL** and the **Text**, an **Open
link** shortcut for web, email and phone addresses, and **Unlink**. Change either field and press Enter
(or click away) to keep the change; press Escape to put it back. Clearing the URL, or pressing Unlink,
removes the link and leaves the words; clearing the Text deletes the link. From the keyboard, press
Ctrl-K (Cmd-K on a Mac) with the cursor in a link to jump into the URL field. It only shows in the box you
are typing in, and never in a box you can only read.

**How do I put a table in a note or a comment?**
Use **Insert table** in the formatting strip: an eight-by-eight grid opens, move over it (or use the arrow
keys) until the label reads the size you want — "2 × 3 table" — then click, or press Enter. The first row
is a header row. Escape closes the grid without inserting. The tool is greyed out while your cursor is
already inside a table, because a table cannot go inside another one.

## Notes

**What is a note, and how is it different from a ticket?**
A note is a page of writing that belongs to a workspace or a project, not to a ticket. Use it for anything
that is not one piece of work — a log, a parts list, something you want to keep after the ticket it came
from closes. Find it at **Notes** in the nav, left of Inbox.

**What is the thin line at the top of a note?**
A reading-progress bar: it fills from the left as you scroll down the note, so you can see how far through
a long one you are. It measures the text of the note only (not the title or byline above it), starts over
when you open another note, and is there whether or not you can edit the note. If your device is set to
reduce motion it moves without the smoothing.

**How do I link to one heading in a note?**
Hover the heading and press the small link icon at its end (Tab to it and press Enter with the keyboard; on a
touch screen the icon is always visible). That copies a link ending in `#` and the heading's name, and
opening it scrolls straight to the heading. It works on all six heading levels. Two headings with the same
words get `-2`, `-3` and so on, in the order they appear — so a link can point at the wrong one if you
rearrange headings that share a name. The person you send it to still needs access to the note.

**Why does my note open with a bar saying "Restored unsaved changes"?**
Last time you had it open, some of what you typed never reached the server (you lost the connection, or
closed the tab first), so it was kept on your device and is showing now. **Keep** carries on with those
words; **Discard** deletes them and shows the note as the server has it, which cannot be undone. The
bar is only shown to people who can edit the note.

**If I mention someone in a note, do they get told?**
Yes — type `@` and pick them, in the note or in one of its comments. They get a *mentioned you* message in their Inbox
that opens the note, or the comment. It is sent once: saving the note again with the same
mention in it does not tell them again, and mentioning yourself sends nothing. Only people who can read the note
are told — a note shared with nobody else, or with a list that leaves them out, tells them nothing, and you are
not shown that. Muting Mentions under Account → Notifications hides these too.

**Who can read my note?**
Whoever the Scope you picked names — **Private** means only you, **Workspace** means everyone in the
workspace except guests, **This project** means everyone actually on that project, **Same as the
ticket** means whoever can see any ticket it is attached to, and **Specific people** means exactly the
people you chose. You, as its author, always read your own note whatever its Scope.

**Can the workspace owner read my private note?**
Yes. The owner reads every note in the workspace, whatever its Scope — that is not something you can
turn off from the note's side.

**Can an admin read notes I haven't shared with them?**
No, not by virtue of being an admin. An admin reads a note under the same rule as anyone else: their
own, anything workspace-wide, anything on a project they are actually a member of, anything naming them,
or anything shared the way a ticket they can see is. Being an admin gives no extra reach into notes — only
the owner gets that.

**Why can't I find a note I know exists?**
A few reasons, in order of likelihood: its Scope does not include you; it was deleted (check the
Deleted group, if you may see it); your search words do not spell-match closely enough and it has not
been found by meaning yet, because meaning search only understands English; or you are searching from
the wrong workspace or project section of the tree.

**Does search understand other languages, or Garo?**
Word-based search does — including its near-miss spelling correction. Meaning-based search is an
English-only model today; a Garo-tuned one is a planned follow-up, not built.

**What happens to a note when I delete the ticket it is on?**
The note stays attached — deleting a ticket does not detach anything. But a deleted ticket no longer counts
as active work, so if the note's Scope is **Same as the ticket** and this was its only attached ticket, nobody but
you (its author) and the workspace owner can read it until it is detached or restored. Restoring the
ticket restores that reach automatically, with nothing to redo.

**Can I get back an old version of a note?**
Yes. Open **History** from the note's byline, pick a version, and press **Restore** — if you can edit
the note. A reader can open History and look, but not put an old version back.

**Why does a link in a comment show a title I can't open?**
Because the chip shows the title the note (or ticket) had when the link was written, even to someone who
cannot open it. That is today's behaviour; whether it should instead hide the title is an open question
the product owner is still deciding.

**Can I delete a note?**
Yes — open it and press **Delete…** beside **History** and **Knowledge Graph** (its author, a workspace admin or the owner).
It goes to the **Deleted** group on the Notes page and to **Deleted items** on your Account page, and
**Restore** in either brings it back exactly as it was; a note marked for permanent deletion has to be unmarked first, with **Unmark** in Deleted items.

**What happens if someone stops sharing a note with me while I have it open?**
You are taken back to the Notes list with a message: "That note is no longer shared with you".

---

## Boards, lists and dates

**Can a new ticket start in a column other than the first?**
Yes — press **Create ticket** in the empty column you want, rather than the top-level **Create ticket**
button, and the window opens with that column's state already chosen and the backlog switch off.

**Why is there no Add button on this column?**
Your admin turned off "Tickets can start here" for that state (the manual's state-setup section) — a
ticket cannot be born there, so the column offers no way to try. It can still receive tickets moved into it
from elsewhere; only starting a brand new one there is blocked.

**What do the coloured badges on a card mean?**
Three, when they apply. The **priority badge** — a coloured icon and P1/P2/P3, tinting the whole card
— is always there: red fire for P1, green leaf for P2, frozen-blue snowflake for P3. An **epic chip**
on the card's top line names the epic it belongs to, if any. A **parent-key badge** beside the ticket's key
names its immediate parent, if that parent is not already the epic chip's own ticket.

**Why doesn't the "Only tickets in progress" switch change the Board?**
Because it does not narrow the Board — only the List, Calendar and Timeline. There is a note on screen
saying so, and the note is important, because **a project opens on the Board the first time you look at
it.** So you can turn it on, read "Not started and done are both excluded", and be looking at a Done column full of done cards.

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
get one row per person, with their picture. Click once for *included* (only their tickets), twice for
*excluded* (everything except theirs), and a third time to clear it. It takes effect at once; there is
no Apply. The same sheet sets collaborators, type, state, closed and category the same way, and each one
turns into a removable chip under the tabs — except two, and both say so in words on screen rather than
pretending otherwise. **Collaborators** is applied by no tab at all, and **closed** shows no chip on the
Board, which never shows closed tickets in the first place.

**Can I sort a list how I like?**
Not by choosing. Lists come back in a fixed, repeatable order. You can choose the *grouping* (epic,
status, assignee, type, flat) and which columns show, but not a sort order.

**Does grouping hide anything?**
No. Grouping only rearranges. It never hides a row and never changes the counts — the summary at the
top stays the same however you regroup or collapse. Things with nothing to group under get an honest
bucket: "No epic", "Unassigned".

**What's the "default arrangement. You have not arranged this project" note?**
It is telling you that what you are looking at is the default, not something you chose. Once you pick
your own grouping or columns it goes away. If you have only chosen one of the two, it says so about
just that half. Small thing, and it stops you thinking you set something up when you did not.

**Why does the same ticket appear twice in the list?**
If it is in the "Recently assigned" strip at the top, it also appears in its normal place further
down. That is on purpose.

**Do lists load everything at once?**
They come in pages of fifty with a "Load more" that picks up exactly where the last one stopped — no
repeats, no gaps.

**What happens on a really big project?**
There is a ceiling of **2,000 tickets**. Past it the Backlog, List, Calendar and Timeline all refuse rather than
showing you part of a project pretending to be the whole one — and **the "Create ticket" button
disappears too**, because it reads from the same place. So a project that grows past the ceiling
becomes one you cannot add to.

The way out is the "Only tickets in progress" switch, which is deliberately placed where you can
still reach it from the refusing screen. The Board keeps working throughout.

**My calendar is empty. Is it broken?**
The sentence names what can hide a claim: your filter, closed tickets being hidden, a date field you
switched off with the legend switch, or an epic, which is drawn in the List and not here. It also says
"Undated work is absent, not estimated" — the calendar draws only what someone claimed. When a date field you switched off is hiding claims here, a different
sentence says so, and it claims **ALL** of the month's claims — so treat that one carefully: the calendar
only knows about the claims it was given, and closed or filtered-away tickets are not among them. The count
in the strip tells you what the filters left behind; it cannot see the legend switches, which live only
in this view.

**A ticket's start date is after its due date and the calendar looks odd.**
It is showing you the contradiction rather than quietly fixing it — two separate markers and no bar
connecting them. That is your cue to go and fix the dates.

**What's the difference between the Calendar and the Timeline?**
The Calendar is a month grid; the Timeline is the same idea stretched sideways over weeks, moving four
weeks at a time. Both draw a bar only when a ticket has **both** a start and a needed-by claim. On the
Timeline, anything with only one date, no dates, or a contradiction goes into a list headed *"Not on
the timeline yet"* with a count, saying what is missing for each ticket. Its **Add dates** button opens the
ticket so you can set them. A thin line marks today on the Timeline, and a bar ends on the real day.

**Does the Calendar show closed tickets?**
Not by default, and neither does the Timeline. Both leave closed work out until you ask for it; the List
and the Backlog do not, and the Board never shows them at all. There are two ways to get them back, and
only two. You can set Closed to *closed only* in the Filters sheet, or you can leave Closed alone and
remove the chip the strip is showing that says **Closed: hidden** — that is the one that means "hidden,
and here is the way back". Setting Closed to *everything* does *not* do it, because *everything* and
*never touched it* are the same setting, which is the whole reason the chip is there. And be careful with
it: set Closed to *not closed* and you get a chip with the same name whose **×** only clears your own
setting, so the closed tickets stay hidden. There is also one case where the calendar's own empty-month note
gets this wrong — see the manual's Calendar section.

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
A dot on the Inbox link. It says only *that* you have something new, never how many — the count is in
the link's name for a screen reader. It refreshes about once a minute. If a refresh fails it keeps
showing the dot rather than clearing it, and it shows nothing at all before the first answer comes
back — an absence, not a zero.

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
earn. A blank space there is the normal way of saying "nothing needs you right now". On the website's My work
page one line takes its place, *"Nothing needs your attention for"* and the chips you have selected, and it is
left out whenever a workspace could not say what needs your attention (its refusal shows instead).

**The strip only shows five rows. Where's the rest?**
Each ticket appears once, under its strongest reason (overdue, then blocked, stale, due soon, contested), and
the strip shows the first five. If there are more, **Show all** and the number is under them; **Show
fewer** folds it back.

**Seven days is too long / too short for us.**
Both numbers — "sitting too long" and "how far ahead counts as due soon" — can be changed by the owner
or an admin, and the lists update to match. Seven days is the default for both, and if nobody has set
them the screen says nobody set them rather than pretending seven was a choice. Blocked is not affected
by either number: blocked is blocked.

**I clicked an Inbox message and the ticket wouldn't open.**
*"That ticket cannot be opened from here. It may have been removed, or it is no longer visible to you.
The message itself is yours and stays."* That last part matters — the message does not disappear just
because you lost access to what it was about. It was sent to you, so it is yours. The notice clears
itself next time something opens successfully.

**A person's name in a notification shows as a strange code.**
Known limitation, not something wrong with your account. That screen currently shows people by their
raw account identifier rather than looking up the real name, because the piece that would do the
lookup has not been built for it yet.

---

## Privacy

**Can I keep a ticket private from most of the team?**
Yes. Every ticket has a "Who can see this" setting with four options: everyone in the workspace, everyone
on the project, only the people you name, or inherited from the parent.

**Does the owner see everything, even the private ones?**
Yes, always — and the screen says so on **every** setting, all the time: *"Visible to: these people, and the workspace owner, always."* It shows that line even when you have picked "Everyone in the
workspace" and even to somebody who cannot change the setting. Showing it only on the private option
would let people assume the other options exclude the owner.

**If I set a big ticket to "only the people I name", do the smaller tickets under it follow?**
Yes, as long as they are set to inherit. Anything that has set its own audience keeps it, and
everything under that keeps it too. Move a ticket to a new parent and it takes the new parent's audience,
along with everything under it. Move it to the top and it falls back to the project default. Set it
back to inheriting and it and everything below re-attach.

**What if I accidentally leave myself off the list?**
You get a warning: *"You are about to lose access to this ticket. A project admin, or the workspace owner, who always sees it, can restore it."* **And then it does exactly what you told it to.** It does
not quietly add you back behind the warning — silently adding you would file a claim in your name that
you never made. So read the warning. You cannot apply an empty list; the button stays off.

**Who is allowed to change who sees a ticket?**
A project admin **of that ticket's project**, or whoever created the ticket. Being an admin of a different
project does not help. If you are not one of those, the product will let you fill the form in and the
server will refuse it, saying why.

**Can I see who a ticket is currently shared with?**
**No — and this is a real gap.** The setting cannot be read back. On the one screen whose entire
subject is who can see what, the current audience shows as unavailable rather than a guess.

Guessing would be much worse, so the behaviour is right and the hole is still real. **Keep your own
note of what you set**, because the screen will not remind you.

**If I share a ticket with somebody, can they see who else it's shared with?**
No. The ticket's page does not disclose the list, or which parent it inherited its audience from.

**When I hide something, what does the other person see?**
Nothing. It simply is not there. There is no "you don't have permission" screen for hidden work —
hidden means invisible. If they go looking for it directly they get exactly the same "not found" as a
made-up reference, deliberately identical, so that nobody can work out what exists by watching which
refusals they get. The same is true of a ticket's history and of trying to change one.

**What can a guest see?**
Only the tickets somebody explicitly shared with them, and any ticket assigned to them. Not the project, not the rest of the workspace. They see the workspace's name and an empty project list — intended, not broken. They cannot open the people list and cannot create tickets.

**Can somebody hide who they are?**
No. History always shows who did what and when, untouched, to anybody entitled to see the ticket — even
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

**It is reachable now, but only narrowly.** Type `:ticket ` followed by a few words, in a ticket's comment
box or in a note, and a picker opens over this same engine's results. There is still no general search
screen of its own — nowhere you type a query and read this engine's results directly, the way the two
narrowing boxes let you read theirs.

**Is there a search anywhere at all?**
Three places now, and only one of them is the deep search. On the **phone app's board screen** — where,
offline, it says "searching offline copy" underneath, so you know the results might be a little out of
date — and on the **website's project board**, in the box above the tabs, both only narrow something
already on screen. The `:ticket ` picker reaches the deep search described just above, narrowed to tickets
and only from inside a comment or a note (the manual's Notes section) — still not a screen of its own.
Notes have a separate search again, on the Notes page: its own engine, and it only searches notes. The
**Help** page has its own search too, over the manual and this FAQ only (below).

**How do I search the help?**
Type in the search box at the top of the Help page's contents list (it says **Search help**); matches
from the manual and the FAQ replace the page until you clear the box, and you go back to where you were.
Press **/** anywhere on the page, except while typing in a box, to jump to it. On a phone the search is
behind the round **Contents and search** button at the bottom right, inside the panel it opens (Escape
clears what you typed first, and closes the panel on the next press); picking a
match closes the panel and takes you to the entry. The page has no Next button — it reads straight down.

**If I use the deep search through the `:ticket` picker, what would catch me out?**
Two things, on the ticket-search half at least — the picker inherits the engine's own limits:

- **It matches words exactly as typed.** Searching "licences" will not find "licence". No plurals, no
  word-stem cleverness.
- **It does not look inside attached files or images.** A phrase that only exists inside a PDF will
  never be found.

---

## Offline, phone and desktop

**Are there real apps, or is it just a website?**
There is a real desktop app and a real phone app, each keeping its own copy of your work on the
device. They are not just the website in a frame.

But: **the phone app is two screens** — a board and a ticket. That is the whole app. And **the desktop
app currently tells you to sign in on the website, then paste something across into its settings by
hand.** That is described as a temporary arrangement and it is not something to ask a nervous
colleague to do. Neither app has been tested on an actual phone or an actual computer in the field —
only the pieces underneath have.

**Can I use it on the train with no signal?**
On the phone or desktop app, yes — for reading. You can open the ticket list, open a ticket, see the board,
read a ticket's full history, see the ticket types and states, and see your assigned work, all from the copy
on the device.

For changing things, you get whatever the two screens offer, which is not much: create a ticket, move one
between states, reopen one, post a comment, deal with a disputed claim. The queue underneath will
carry more kinds of change than that — but **a queue accepting a kind of change is not a screen
offering it**, and offline you still cannot assign anybody or set a due date. **That is a property of
these apps rather than of being offline:** they have no Assignee row in either state. The website's
panel *can* set one, and it is online-only — there is no offline queue there to carry it.

**The browser version is online-only.** It has no offline queue at all — which is why its "claims
waiting to send" section is always empty on the web. Offline is the apps' responsibility.

**Seven things flatly refuse offline** rather than making something up: your list of workspaces, the
people list, the ordinary search, the standard My work view, the "Needs your attention" strip, and both
reading and saving your preferences. Each names what is missing rather than showing an empty screen.

**I made a ticket offline and it vanished from the board.**
Expected, and narrow: a ticket created *entirely* offline — one the server has never seen — will not
appear on the board or the ticket list until the server confirms it. Search for it by name in the offline
search and it will turn up.

**What does "claim in transit" mean?**
Something you changed that the server has not confirmed yet. It is on its way, not yet locked in. You
get a small badge on that ticket, both on the board and in ticket lists, so you always know when you are
looking at something unconfirmed versus something saved for good. The ticket screen shows your
unconfirmed change alongside the last confirmed version.

**What happens when I get signal back?**
Nothing you have to do. Your changes go up in the order you made them, so a ticket is never edited on the
server before it has been created there. The status label moves through "Offline: n claims waiting to
send", then "Catching up…", then "Live".

**What if the network fails halfway through sending?**
Treated as temporary. Your change stays queued and is retried with a growing gap between tries — a
second, then two, then four, up to about a minute. It is **never** marked as failed for a network
problem. Only a genuine "no, that breaks a rule" answer is final.

**Two of us edited the same ticket while I was offline. Who wins?**
It depends which of two things happened, and they are treated very differently.

**A plain race — you both just typed different things.** The later one wins. The earlier one survives
in the ticket's history. **Nobody is told.** No banner, no warning, no record of a dispute — a race is not
a rule violation.

Be aware of this. If two of you change the same brief while one is on a train, one gets quietly
overwritten and neither of you finds out. The history has it; nobody is going to go looking.

**Your change had become against the rules by the time it arrived** — the ticket got reassigned, the
states changed, or it got un-shared from you. Then it is refused, recorded as a **disputed claim**, and
you get a banner.

**What does the disputed-claim banner tell me?**
Who claimed it, what kind of change it was, which rule refused it, that rule's reason in its own words,
and when you made it — in Indian time, like *"21 Aug 2026, 00:00 IST"*.

Three buttons:

1. **Discard it** — throw it away, with an optional short note explaining why.
2. **Convert to comment** — turn what you tried to do into a permanent comment on the ticket, carrying
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

- A very large share is **cut off at 200 tickets**, silently. There is no "there was more" signal.
- If something is shared with you and then restricted again before your device fetches it, it is
  dropped and never fetched again.
- There is one rare, still-open case: if the states in a workflow change while your device is holding
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
- A ticket you file at 11pm your time may already be labelled tomorrow.
- Every due date, every "today" ring on the calendar, and every day boundary means India's day.

The reasoning is that everyone reading the same record sees the same day for the same moment, which is
defensible. If you are running a business in Manchester, "due today" is still going to mean something
odd. The only place in the product that acknowledges this is a footnote at the bottom of a ticket's
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
anything, on a small machine. As the history grows, that is the ticket that breaks first.

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
plus the product's own build plans as projects and tickets.

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
- **Whether a ticket can be moved to a different project.** No evidence either way.
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
