# Inter-Varsity Competition Platform
## Complete Product Requirements, Features, Rules, and Setup Specification

**Document status:** Product specification / implementation blueprint  
**Primary use case:** A live, in-person inter-varsity competition where all participating schools are at the same venue.  
**Core format:** Turn-by-turn gameplay, with configurable competition rules.  
**Primary roles:** Admin, Game Master, School Representative/Contestant, and Public Audience.  
**Important exclusions:** No separate scorekeeper role is required. Scores are calculated automatically by the system, with authorized Admin and Game Master overrides.

---

# 1. Product Overview

The platform is a reusable, real-time competition management system for inter-varsity academic competitions and similar live events. It manages competition setup, schools, access codes, rounds, matches, question banks, turn order, timers, answers, automatic scoring, bonus questions, leaderboards, elimination, sponsors, and official results.

The competition takes place at a physical venue. Each participating school uses an authorized device, while a large main screen displays the live event. The Game Master controls the flow of gameplay from a dedicated dashboard.

The platform must be reusable across multiple competitions and editions. Organizers should not need to rebuild the website or re-enter permanent school and sponsor information for every event.

## Core principles

1. The server is the authoritative source for match state, timer deadlines, question availability, answers, and official scores.
2. All screens receive consistent real-time updates.
3. Gameplay is turn-by-turn by default.
4. Administrators configure the rules before each match.
5. Scores are calculated automatically wherever the question type permits.
6. The Admin and Game Master can perform authorized overrides, with every change recorded in an audit log.
7. Schools are created by the Admin and access is controlled by codes and permissions.
8. Questions, school profiles, sponsor profiles, competition templates, and past results can be reused.
9. The platform should work online first, with automatic reconnection and a planned option for local venue operation if internet service fails.
10. Official results and score corrections must be traceable.

---

# 2. User Roles and Permissions

## 2.1 Admin

The Admin has overall management authority.

### Admin capabilities
- Create, edit, archive, and manage competitions.
- Create competition editions and templates.
- Add, edit, activate, deactivate, and archive schools.
- Upload school logos and maintain school profiles.
- Generate, revoke, regenerate, and expire school access codes.
- Create rounds and matches.
- Choose the competition format and turn order.
- Configure qualification, elimination, and tie-breaker rules.
- Create categories and manage the permanent question bank.
- Import questions in bulk and validate imports.
- Assign questions to a match.
- Configure points, penalties, bonus points, timers, and answer rules.
- Configure sponsor profiles, templates, and display schedules.
- Assign Game Masters and other authorized users.
- View live match status and connected-device status.
- Override questions, answers, timers, turns, and scores.
- Pause or suspend a match.
- Review audit logs and official match reports.
- Approve and publish official results.
- Export results and reports.
- Manage platform settings and permissions.

### Admin restrictions and safeguards
- Every override must be recorded with the acting user, timestamp, previous value, new value, and reason.
- Published results should not be silently overwritten. Corrections must create an auditable record.
- Sensitive answer keys must not be exposed to student devices before the permitted reveal.
- Admin actions must be authenticated and permission-checked by the server.

## 2.2 Game Master

The Game Master runs the live match.

### Game Master capabilities
- Open an assigned match.
- View participating schools and connection status.
- Start, pause, resume, and end a match.
- Start, pause, resume, extend, reduce, reset, or stop timers within configured permissions.
- Set the remaining timer value manually.
- Open and close question selection.
- Reveal the selected question.
- Move to the next school or turn.
- Skip a turn when authorized.
- Repeat or reopen a turn when the rules permit.
- Reveal answers and results.
- Mark subjective answers correct or incorrect.
- Override an answer result.
- Override a question assignment.
- Award or deduct points.
- Award or reverse bonus points.
- Show or hide the leaderboard.
- Pause the match during a technical or procedural issue.
- Trigger approved recovery actions.
- End a round and request result finalization.

### Game Master safeguards
- The system should prevent invalid phase transitions, such as starting a new question while the previous answer is still awaiting judgment.
- The Game Master must not be able to silently edit history.
- All overrides require a reason and are logged.
- The Admin may have permission to intervene in a Game Master's active match.

## 2.3 School Representative / Contestant

Each school has an authorized representative or contestant device. The competition setup can define whether the representative also answers questions.

### Capabilities
- Join the correct competition using a school access code and, where required, a match code or contestant PIN.
- See the school's identity and assigned competition.
- View whether it is the school's turn.
- Select a question when the selection phase is open and the school is eligible.
- Submit an answer when the answer phase is open.
- Receive a clear submission confirmation.
- View the current question and timer where permitted.
- View current scores and leaderboard when the Game Master has made them visible.
- See connection and reconnection status.
- Rejoin a session without creating a duplicate participant.

### Restrictions
- A school cannot select a question when it is not eligible to play.
- A school cannot select a question that is no longer available.
- A school cannot submit an answer after the authoritative deadline, unless an authorized official reopens the phase.
- A school cannot alter its score, the timer, the correct answer, or match state.
- A school cannot impersonate another school.
- A school access code identifies the school but should not automatically grant unrestricted control to everyone who knows it.

## 2.4 Public Audience / Main Screen Viewer

Audience members may watch without signing in.

### Public access
- View the main competition screen.
- See the current school, round, category, question, and timer when the event rules allow.
- See answer reveals and results after they are published.
- See the leaderboard when enabled.
- See sponsor graphics.
- View public results after publication.

Audience viewers must not be able to submit official answers or control gameplay.

## 2.5 No Separate Scorekeeper Role

A dedicated scorekeeper dashboard is not required. The system calculates scores automatically from validated answer results and configured scoring rules. The Admin and Game Master can correct questions, answer decisions, and scores when necessary. All corrections must be audited.

---

# 3. Main Interfaces

The application has four primary interfaces.

## 3.1 Admin Dashboard

Suggested navigation:
- Overview
- Competitions
- Rounds and Matches
- Schools
- Access Codes
- Question Bank
- Categories
- Scoring and Rules
- Sponsors and Advertisements
- Users and Permissions
- Live Match Monitor
- Results and Reports
- Audit Logs
- Settings

The overview should show upcoming competitions, active matches, number of registered schools, question-bank totals, and recent activity.

## 3.2 Game Master Dashboard

Suggested layout:
- Match header and status
- Current round and turn
- Current school
- Current question and category
- Authoritative countdown timer
- Available question-selection controls
- Answer and judging controls
- Automatic score summary
- Manual override panel
- Leaderboard visibility control
- Connection-health indicators
- Match event history
- Emergency pause/recovery controls

Use clear confirmation prompts for high-impact actions such as ending a match, voiding a question, or making a large score correction.

## 3.3 Main Competition Screen

Designed for a projector or LED display and readable from a distance.

Display elements:
- Competition name and logo
- Round and match number
- Current school / “Now Playing”
- Current turn position
- Category and question value
- Question text and answer options, when appropriate
- Large countdown timer
- Result announcement
- Current score or leaderboard when enabled
- Sponsor logo or banner
- Transition slides between rounds
- Connection/recovery status if the event is interrupted

The screen should support full-screen presentation mode and should avoid small text, crowded layouts, and unnecessary controls.

## 3.4 School / Contestant Screen

Designed for low-end Android phones and other common browsers.

Display elements:
- Competition and school identity
- Match and round
- “Your turn” / “Waiting for your turn” status
- Available categories or question board
- Question selection controls
- Current question and answer submission controls
- Timer
- Submission receipt
- Current score and leaderboard when permitted
- Connection status

Keep the workflow simple. Students should not need to navigate through multiple pages during a live turn.

---

# 4. Competition Structure and Setup

The Admin creates a competition and configures its structure.

## 4.1 Competition Details
- Competition name
- Competition logo
- Edition or academic year
- Description
- Organizer
- Venue
- Scheduled date and time
- Time zone
- Default language
- Competition status: Draft, Ready, Live, Paused, Completed, Archived
- Branding and theme
- Public viewing setting

## 4.2 Rounds
A competition can contain any number of rounds, such as:
- Preliminary
- Qualifying
- Quarterfinal
- Semifinal
- Final
- Special or bonus round

For each round, configure:
- Round name and order
- Schools eligible to participate
- Match format
- Questions or question pool
- Timer defaults
- Scoring rules
- Qualification and elimination rules
- Tie-breaker rules
- Whether leaderboard is available
- Whether an Admin must approve results before advancing

## 4.3 Matches
Each round may contain one or more matches.

A match contains:
- Unique match ID
- Competition and round
- Participating schools
- Turn order
- Assigned questions
- Categories
- Scoring configuration
- Timer settings
- Bonus rules
- Status
- Match event history
- Final results

## 4.4 Match Setup Wizard

Use a guided setup process.

### Step 1: Select Competition and Round
Choose the competition edition, round, and match number.

### Step 2: Select Schools
Choose the schools registered by the Admin. Validate the number of schools required by the round.

### Step 3: Configure Turn Order
Options:
- Fixed order
- Randomized order generated before the round starts
- Manually arranged order

Lock the turn order when the match begins, unless an authorized official changes it.

### Step 4: Configure Gameplay
Set question-selection method, question count, categories, points, bonus rules, timers, answer handling, and turn rules.

### Step 5: Assign Questions
Select questions from the permanent question bank or import new questions. Ensure the match has enough questions for its configured rules.

### Step 6: Configure Advancement
Set how many schools qualify, which schools are eliminated, how ties are handled, and whether result approval is required.

### Step 7: Assign Sponsors
Choose reusable sponsor profiles and schedule their display templates.

### Step 8: Review and Publish
Show a complete summary. Validate all settings, then publish the match and generate the relevant access/join codes.

---

# 5. Competition Formats

The platform should support configurable formats, even though turn-by-turn play is the default.

## 5.1 Turn-by-Turn Mode (Default)

Schools play one at a time in the configured order.

Typical flow:
1. Game Master starts the match.
2. System identifies the next eligible school.
3. The school selects an available question, if question selection is enabled.
4. The server validates the selection and marks the question unavailable.
5. Main screen announces the selected school and question.
6. The question is revealed according to the configured rules.
7. Timer starts from the authoritative server deadline.
8. Contestant submits an answer or the Game Master records a verbal answer.
9. The system judges the answer automatically where possible.
10. Score is calculated and updated.
11. Result is shown.
12. Game Master starts the next turn.
13. Repeat until the configured end condition is reached.

## 5.2 Versus / Head-to-Head Mode

Two schools compete in a match. The platform can support multiple head-to-head matches within a round.

The Admin configures:
- Pairings
- Number of questions
- Points
- Turn order
- Tie-breaker
- Winner advancement
- Loser elimination or placement competition

## 5.3 All-Schools Round / Elimination Stage

All schools in a group participate in the same round, taking turns. The system ranks them by official score after the configured number of turns or questions.

The Admin can configure:
- Top N schools qualify
- Bottom N schools are eliminated
- Top percentage qualifies
- Minimum qualifying score
- Manual qualification approval
- Tie-breaker for the qualification boundary

Example: Eight schools participate; the top four advance. The system calculates the rankings, flags ties that affect qualification, and allows an authorized official to approve the next round.

This is not simultaneous answering by default. All schools may be in the same match, but each school takes its turn in order.

---

# 6. Question Bank and Question Selection

## 6.1 Permanent Question Bank

The question bank stores reusable questions independently of individual matches.

Question fields:
- Question ID
- Question text
- Category
- Topic or subcategory
- Difficulty
- Question type
- Answer options, if applicable
- Correct answer or answer key
- Explanation / judge notes
- Default points
- Default time limit
- Bonus status and bonus configuration
- Media attachments
- Source/reference notes if needed
- Creator
- Creation and update timestamps
- Active/archive status

Supported question types should include:
- Multiple choice
- True/false
- Short text answer
- Numerical answer with accepted tolerance, if appropriate
- Subjective / judge-marked answer
- Image- or diagram-based question
- Optional audio/video-supported question

Do not expose answer keys to student clients before the official reveal.

## 6.2 Question Import
Support:
- Manual entry
- Bulk entry
- CSV import
- Excel import
- Image and diagram attachments

Before importing, validate required fields, option structure, correct-answer data, categories, points, and duplicate records. Provide an import preview and error report before saving.

## 6.3 Categories and Question Counts
The Admin can create categories and set how many questions are available from each category in a match.

Example:

| Category | Questions assigned |
|---|---:|
| Physics | 10 |
| Mathematics | 10 |
| Chemistry | 10 |
| General Knowledge | 10 |
| Total | 40 |

The system must check that the match contains enough questions for its planned number of turns and selection rules.

## 6.4 Selection Methods
Allow the Admin to choose a selection method for a match:
- Select a specific question from a visible question board
- Select a category and point value, then have the system assign a matching question
- Select a category, then have the system randomly assign an available question
- Disable contestant selection and have the Game Master assign questions

The question text must remain hidden until the configured reveal point.

## 6.5 Preventing Duplicate Question Selection
Each match-question assignment has its own state:
- Available
- Reserved / processing
- Selected
- Active
- Completed
- Disabled
- Voided

The server must validate and commit selection atomically. If two requests attempt to select the same question, only one may succeed. Other clients receive the updated availability state.

Reusing a question in a future competition must not make it selectable again in a match where it has already been used.

## 6.6 Question Overrides
Admin and Game Master, subject to permissions, can:
- Replace a question before it becomes active
- Void a defective or disputed question
- Mark a question as unavailable
- Reassign a question
- Reopen a question if the rules allow
- Award a configured replacement question

Every change must be recorded. If a question is voided after scoring, the system must handle score reversal or replacement according to the configured rules and record the correction.

---

# 7. Turn Management

Turn management is a core module.

## 7.1 Turn State
Track:
- Current school
- Turn number
- Next school
- Completed turns
- Skipped turns
- Current phase
- Current question
- Timer deadline
- Answer status
- Score result

## 7.2 Game Master Controls
- Start Match
- Start Turn
- Pause Turn
- Resume Turn
- Skip Turn
- Repeat Turn (only when allowed)
- Open Selection
- Lock Selection
- Reveal Question
- Start Timer
- Pause Timer
- Resume Timer
- Add Time
- Reduce Time
- Set Remaining Time
- Stop Timer
- Reveal Answer
- Mark Correct
- Mark Incorrect
- Award Bonus
- Override Score
- Void Question
- Next Turn
- End Round
- End Match

The system must prevent invalid state transitions and show clear reasons when a command cannot be performed.

## 7.3 Turn Order
Turn order may be:
- Fixed by the Admin
- Randomized before the round starts
- Manually configured

Once a round begins, preserve the order unless a permitted override is logged.

## 7.4 Wrong Answer and Steal Rules
The Admin configures the wrong-answer policy:
- End the turn and award no points
- Allow another school to steal
- Allow the Game Master to decide whether to offer a steal
- Use a category- or round-specific rule

If steals are enabled, define:
- Eligible schools
- How a school claims the chance to answer
- Whether first-to-buzz applies
- Time limit
- Bonus points for a successful steal
- Penalty for a wrong steal attempt
- Tie handling if requests arrive at nearly the same time

Steals should be disabled unless explicitly configured.

---

# 8. Timer System

The timer must be controlled by the server, not by independent browser countdowns.

## 8.1 Timer Settings
The Admin can configure separate durations for:
- Question selection
- Answering
- Bonus question
- Steal opportunity
- Other configured phases

## 8.2 Timer Controls
Authorized Admin and Game Master controls:
- Start
- Pause
- Resume
- Add time
- Reduce time
- Set remaining time manually
- Restart when permitted
- Stop
- Force phase completion

## 8.3 Technical Design
Store authoritative timer state, including:
- Status
- Start timestamp
- Deadline
- Duration
- Paused remaining time, if paused
- Match and phase IDs
- Last modifying user
- Last modification timestamp

Clients calculate remaining time from the server deadline. When a device reconnects, it retrieves the current authoritative state.

## 8.4 Timer Expiration
When the deadline is reached:
- The server closes the phase.
- Late submissions are rejected unless the phase is reopened by an authorized official.
- The system follows the configured timeout rule.
- A timeout event is recorded.
- The main screen and relevant devices update.

## 8.5 Override Audit
Every timer override records the old value, new value, user, timestamp, and reason.

---

# 9. Answer Submission and Judging

## 9.1 Automatic Judging
For supported objective question types, the server evaluates the submitted answer against the protected answer key.

For text or numerical answers, the Admin may configure:
- Case sensitivity
- Whitespace handling
- Accepted alternative answers
- Numeric tolerance
- Exact or partial matching, where appropriate

Do not rely on answer validation performed only in the browser.

## 9.2 Manual Judging
For subjective or verbal answers:
- The Game Master records or confirms the answer.
- The answer is marked correct, incorrect, or pending review.
- A judge note may be added.
- The score is calculated after the decision.
- Any later change is audited.

A separate scorekeeper is not required.

## 9.3 Submission Rules
The server checks:
- Is the match active?
- Is this the correct school or contestant?
- Is this the active question?
- Is the answer phase open?
- Has the deadline passed?
- Has the permitted attempt already been used?
- Is the submission a duplicate?

Store a server-side receipt for each accepted answer.

## 9.4 Answer Display
The Admin can configure whether the main screen displays:
- The selected answer before judgment
- The correct answer only after the reveal
- The result and points
- An explanation after the answer
- A school name or contestant name

The answer key must not be exposed to unauthorized clients before the reveal.

---

# 10. Automatic Scoring and Bonus Rules

## 10.1 Configurable Points
The Admin sets points per question. Different categories, difficulty levels, rounds, and question types may use different values.

Example values only:
- Standard question: 10 points
- Difficult question: 20 points
- Bonus question: 30 points
- Speed bonus: 10 additional points

These are not hardcoded defaults; the Admin can change them.

## 10.2 Scoring Events
Record each score change as a separate event:
- Correct answer
- Bonus awarded
- Speed bonus awarded
- Penalty
- Manual adjustment
- Answer correction
- Question void/reversal
- Result correction

The official score is derived from validated score events or maintained through a transactionally consistent score total.

## 10.3 Bonus Types
Allow configuration of:
1. Fixed bonus attached to a question
2. Bonus round
3. Speed bonus for correct answers within a configured window
4. Steal bonus
5. Optional risk/reward bonus with configured penalty rules

For every bonus type, configure:
- Eligibility
- Base points
- Bonus points
- Time limit, if relevant
- Incorrect-answer consequence
- Whether it affects qualification standings
- Whether manual approval is required

## 10.4 Manual Score Overrides
Admin and Game Master can, according to permissions:
- Add points
- Deduct points
- Award or reverse bonus points
- Correct a scoring error
- Override an answer result
- Reverse a prior score decision

Each override requires a reason and audit record. The system updates the leaderboard after the transaction is committed.

## 10.5 Score Integrity
Never silently overwrite score history. Corrections must reference the original score event and record the adjustment. Use database transactions to prevent partial or duplicate scoring.

---

# 11. Leaderboard, Qualification, and Elimination

## 11.1 Leaderboard Controls
The Game Master can:
- Show leaderboard
- Hide leaderboard
- Show scores without rank
- Show top N schools
- Reveal full standings
- Display final results

The Admin can restrict which options are available in a round.

## 11.2 Leaderboard Data
Display:
- Rank
- School name and logo
- Score
- Correct answers, if enabled
- Turns completed, if useful
- Qualification status when appropriate

Avoid revealing confidential information.

## 11.3 Qualification Rules
Options:
- Top N schools qualify
- Bottom N schools are eliminated
- Top percentage qualifies
- Minimum score required
- Winners of head-to-head matches advance
- Manual approval by Admin
- Configured tie-breaker

## 11.4 Tie-breakers
Allow rules such as:
- Head-to-head result
- Number of correct answers
- Fewer penalties
- Faster total answer time, if reliably measured and part of the official rules
- Additional tie-breaker question
- Manual decision by authorized officials

The Admin defines the order of tie-breakers before the match starts. If a tie remains unresolved, flag it for official review rather than arbitrarily choosing a school.

## 11.5 Elimination
After results are confirmed:
- Mark qualifying schools
- Mark eliminated schools
- Record the reason or rule applied
- Update the next round's eligible schools
- Require approval if configured
- Prevent eliminated schools from joining later rounds unless reinstated by an authorized override

---

# 12. School Management and Access Codes

## 12.1 School Registry
The Admin manually adds schools.

School fields:
- School ID
- Official name
- Abbreviation
- Logo
- Country / state / location, if needed
- Contact or representative details, if needed
- Active status
- Notes
- Creation and update timestamps

Schools remain available for reuse in future competitions.

## 12.2 Access Code Management
The system can generate secure, unique codes for schools or competition participation.

Admin controls:
- Generate code
- Regenerate code
- Revoke code
- Set expiry
- Restrict code to a competition, round, or match
- Limit registered devices or active sessions
- View usage and last-used time

Avoid using predictable codes as the only security control for sensitive actions.

## 12.3 Joining Flow
1. Student or representative opens the join page.
2. Enters the school access code and any required competition code or PIN.
3. Server validates code status and scope.
4. User is assigned to the correct school and session.
5. Device receives the current match state.
6. User sees whether they can act or must wait.

## 12.4 Device Policy
Default to one official active answering device per school for turn-by-turn play. The Admin may configure more devices if needed. A spectator link can remain separate from official contestant permissions.

---

# 13. Sponsor Studio and Advertising

## 13.1 Reusable Sponsor Profiles
Sponsor fields:
- Brand name
- Logo
- Website
- Short description
- Brand colours
- Social links, optionally
- Sponsor tier
- Contact notes, if needed
- Active status

Sponsor profiles can be reused across multiple competitions.

## 13.2 Advertisement Templates
Provide reusable templates such as:
- Persistent sponsor logo
- Lower-third banner
- “This question is sponsored by” graphic
- Transition slide
- Sponsor spotlight
- Main competition partner slide
- Final-results sponsor acknowledgment

The platform generates the graphics from sponsor details and a template. Admins can preview before publishing.

## 13.3 Scheduling
Configure when each sponsor appears:
- Before match
- During question selection
- During gameplay as unobtrusive branding
- Between questions
- Between rounds
- During breaks
- During final results

Do not cover questions, answer options, or timers during active gameplay.

## 13.4 Sponsor Reporting
Where required, record sponsor display events, match, template, and timestamp. Reports should distinguish between a graphic being displayed and proof that a person actually viewed or engaged with it.

---

# 14. Real-Time Synchronization

## 14.1 Authoritative Backend
The backend and database control:
- Match status
- Current turn
- Current phase
- Active question
- Question availability
- Timer deadline
- Answer acceptance
- Answer judgment
- Score events
- Leaderboard
- Qualification status

Browsers display the state and submit authorized commands. They do not independently decide official outcomes.

## 14.2 Real-Time Events
Use a WebSocket or managed real-time service to distribute small, scoped events.

Suggested event types:
- `MATCH_READY`
- `MATCH_STARTED`
- `MATCH_PAUSED`
- `MATCH_RESUMED`
- `TURN_STARTED`
- `TURN_SKIPPED`
- `QUESTION_SELECTION_OPENED`
- `QUESTION_SELECTED`
- `QUESTION_REVEALED`
- `TIMER_UPDATED`
- `TIMER_EXPIRED`
- `ANSWER_SUBMITTED`
- `ANSWER_JUDGED`
- `SCORE_UPDATED`
- `LEADERBOARD_VISIBILITY_CHANGED`
- `ROUND_COMPLETED`
- `QUALIFICATION_UPDATED`
- `MATCH_COMPLETED`
- `CONNECTION_STATUS_CHANGED`
- `SPONSOR_DISPLAY_CHANGED`

Every event should be scoped to the relevant competition/match and include a unique event ID and version/sequence number.

## 14.3 Snapshot and Reconnection
When a client first joins or reconnects:
1. Authenticate and authorize the client.
2. Fetch the current permitted match snapshot.
3. Subscribe to relevant real-time events.
4. Apply only newer events.
5. Periodically reconcile against authoritative state where appropriate.

A reconnecting device must not overwrite a newer state with stale cached data.

## 14.4 Concurrency
Use database transactions and constraints to prevent:
- Duplicate question selections
- Duplicate official answer submissions
- Double-awarded points
- Invalid turn changes
- Two simultaneous commands both changing the same phase
- Conflicting timer overrides

## 14.5 Load Testing
Test with realistic concurrent devices, for example 50, 100, 250, 500, and 1,000 users depending on the expected event size. Measure latency, database performance, reconnection behaviour, and correctness under simultaneous requests. These are test targets, not capacity guarantees.

---

# 15. Online Operation and Local Venue Recovery

## 15.1 Recommended First Release: Online-First
Use a central backend and database with real-time updates. Add:
- Automatic reconnection
- Connection-status messages
- Authoritative state snapshots
- Safe handling of uncertain submissions
- Persistent match events
- Clear pause/recovery procedure

## 15.2 Optional Future Feature: Local Venue Mode
A later version may support a local server or designated venue computer so devices on the venue's local Wi-Fi can continue a match during an internet outage.

This requires deliberate design:
- Local server application
- Local network discovery or QR-based connection
- Local persistence
- Authentication and permissions
- Duplicate-event protection
- Clear authority rules when online and local modes reconnect
- Reconciliation and synchronization
- Tested backup and recovery procedures

Do not promise offline gameplay until this mode has been implemented and tested. Browser caching alone is not sufficient for a reliable live competition.

## 15.3 Recovery Behaviour
If a connection is lost:
- Show the last confirmed state.
- Indicate that the device is disconnected.
- Prevent unconfirmed submissions from appearing as accepted.
- Reconnect automatically.
- Fetch the authoritative state after reconnection.
- Allow the Game Master to decide whether to resume, restart, void, or reopen the affected phase according to competition rules.

---

# 16. Security and Fair Play

Required controls:
- Authentication for Admin and Game Master.
- Role-based authorization enforced on the server.
- Secure access-code generation and revocation.
- Match-scoped access permissions.
- Server-side validation for all selections, answers, scores, and timer actions.
- Correct answers kept private until reveal.
- Rate limits for joining and answer submissions.
- Protection against duplicate requests and replayed commands.
- Audit records for sensitive actions.
- Safe file upload validation for logos and question media.
- HTTPS for online operation.
- Secrets and service keys stored server-side.
- Database backups and recovery testing.
- Separation of public screen data from private judging data.
- Session expiration and revocation.
- No ability for a student to award points or alter match state.

---

# 17. Reports and Exports

The Admin should be able to generate:
- Competition summary
- School participation list
- Match results
- Final standings
- Question-by-question results
- Correct and incorrect answer counts
- Bonus points and penalties
- Score correction history
- Timer override history
- Match event timeline
- Qualification and elimination report
- Sponsor display report

Export formats:
- PDF
- Excel
- CSV

Reports must use official, finalized data and indicate whether a result is draft, pending approval, or final.

---

# 18. Database Design

The implementation should use a relational database such as PostgreSQL.

Suggested core tables:

| Table | Purpose |
|---|---|
| `users` | Admins, Game Masters, and authorized accounts |
| `roles` / `user_permissions` | Role and permission definitions |
| `schools` | Permanent school registry |
| `school_access_codes` | Secure access codes, scope, expiry, and revocation |
| `competitions` | Competition editions and configuration |
| `competition_rounds` | Rounds and their rules |
| `matches` | Individual match sessions and current state |
| `match_schools` | Schools participating in a match and turn order |
| `categories` | Reusable question categories |
| `questions` | Permanent question bank |
| `question_options` | Options for objective questions |
| `question_media` | Images, diagrams, audio, or video references |
| `match_questions` | Questions assigned to a particular match and their state |
| `participants` | Authorized representatives or contestants |
| `match_participants` | Participant permissions and match assignments |
| `question_selections` | Validated school question selections |
| `answers` | Submitted answers and judging state |
| `score_events` | Official score changes and corrections |
| `timer_events` | Starts, pauses, extensions, and overrides |
| `match_events` | Chronological event history |
| `sponsors` | Reusable sponsor profiles |
| `sponsor_campaigns` | Sponsor assignments and display schedules |
| `sponsor_impressions` | Sponsor-display event records, where needed |
| `competition_templates` | Reusable setup templates |
| `audit_logs` | Sensitive actions and administrative changes |

The final schema should include primary keys, foreign keys, unique constraints, indexes, timestamps, status fields, and transaction-safe rules. The match state should be versioned to prevent stale updates.

---

# 19. Suggested Technology Stack

A practical web stack could be:

- **Frontend:** React or Next.js
- **Styling:** Tailwind CSS
- **Backend:** Next.js server routes or a dedicated Node.js service
- **Database:** PostgreSQL
- **Database hosting:** A managed PostgreSQL service such as Neon
- **Real-time communication:** WebSockets or a managed service such as Ably or Pusher
- **Authentication:** A secure authentication provider or a well-maintained session-based implementation
- **File storage:** Object storage for logos and question media
- **Hosting:** A managed application host suitable for the expected traffic
- **Monitoring:** Application errors, server health, real-time connection health, and database performance

The real-time provider is responsible for distributing events, not for determining official scores. The backend and database remain authoritative.

---

# 20. UI and Design Requirements

The interface should feel like a polished live-event control system rather than a generic form website.

## Main screen
- Large readable typography
- High contrast
- Minimal clutter
- Clear turn and round indicators
- Prominent timer
- Strong result animations, used sparingly
- Sponsor branding that does not obscure gameplay
- Full-screen display mode

## Game Master
- Clear primary controls
- Distinct dangerous-action confirmations
- Current state always visible
- Timer controls easy to reach
- Score and question overrides separated from ordinary actions
- Connection and event status visible

## Student screen
- Mobile-first
- Large touch targets
- Minimal steps
- Clear waiting/active states
- Immediate submission confirmation
- Connection feedback
- No unnecessary admin controls

## Admin
- Structured navigation
- Search and filters for schools and questions
- Bulk import with validation
- Setup wizard
- Reusable templates
- Clear audit history
- Confirmation before publishing or destructive actions

---

# 21. Functional Acceptance Criteria

The first release should not be considered ready until the following have been tested.

## Competition setup
- Admin can create a competition, round, and match.
- Admin can add schools and assign them to a match.
- Admin can set turn order, questions, points, bonuses, and timers.
- System blocks publishing if required configuration is missing.

## Access codes
- Admin can generate and revoke school access codes.
- A valid code grants access only to its permitted scope.
- An expired or revoked code is rejected.
- A school cannot impersonate another school by changing browser data.

## Turn management
- The system identifies the correct current school.
- Only the eligible school can select a question during its turn.
- Game Master can advance or pause the turn within the rules.
- Turn overrides are recorded.

## Question selection
- A selected question becomes unavailable for that match.
- Simultaneous selection attempts cannot reserve the same question twice.
- Students cannot view answer keys before reveal.
- Question replacement and voiding are audited.

## Timer
- All connected screens calculate the same remaining time from the server deadline.
- Manual timer changes propagate to all screens.
- Late answers are rejected unless the phase has been reopened.
- Reconnecting devices receive the current timer state.

## Answers and scoring
- Objective answers are judged on the server.
- Correct answers award the configured points exactly once.
- Bonus rules are applied correctly.
- Manual score overrides require a reason and are audited.
- Score corrections update standings consistently.

## Leaderboard and qualification
- Leaderboard visibility can be controlled by the Game Master.
- Standings reflect official score events.
- Qualification rules are applied correctly.
- Ties affecting elimination are flagged or resolved using the configured rule.
- The next round contains only eligible schools unless an authorized override is recorded.

## Reliability
- A disconnected client can reconnect and recover the current state.
- Duplicate requests do not duplicate selections or scores.
- A match can be paused and safely recovered.
- Load tests pass at the agreed target audience size.

---

# 22. Development Roadmap

## Phase 1: Core Competition
Build:
- Authentication and permissions
- School registry and access codes
- Competition, round, and match setup
- Question bank and categories
- Turn-by-turn engine
- Game Master dashboard
- Main competition screen
- Student screen
- Server-controlled timer
- Answer submission
- Automatic scoring and bonus rules
- Basic leaderboard

## Phase 2: Competition Progression
Build:
- Qualification and elimination
- Tie-breakers
- Versus/head-to-head format
- Question and score overrides
- Audit logs
- Match history
- Result approval and publication
- PDF/Excel/CSV exports

## Phase 3: Sponsor Studio
Build:
- Sponsor profiles
- Logo and brand settings
- Automatic graphic templates
- Sponsor scheduling
- Transition slides
- Sponsor reports

## Phase 4: Reliability
Build:
- Connection monitoring
- Automatic reconnection
- Match recovery controls
- Load testing
- Monitoring and alerts
- Backup and restore procedures
- Security testing

## Phase 5: Advanced Features
Build:
- Competition templates
- Advanced analytics
- Replay of match events
- Public results pages
- Certificate generation
- Local venue mode, if required
- Additional configurable competition formats

---

# 23. Recommended Default Rules for the First Prototype

These are suggested starting settings, not fixed requirements:
- Competition mode: Turn-by-turn
- Venue: In person
- Official answering device: One per school
- Question selection: Select from available category/question board
- Timer: Configurable by phase
- Scoring: Automatic for objective questions
- Subjective answers: Game Master judgment
- Bonus points: Configurable per question or round
- Wrong answer: Ends the turn unless steals are enabled
- Leaderboard: Controlled by Game Master
- Qualification: Configurable top-N rule
- School access: Admin-generated code
- Overrides: Admin and Game Master, permission-controlled and audited
- Connectivity: Online-first with reconnection
- Offline venue mode: Future enhancement unless explicitly included in the first release

---

# 24. Final Product Definition

Build a reusable, real-time inter-varsity competition platform for live in-person events. The Admin manually manages schools and creates competitions, rounds, matches, questions, scoring rules, bonuses, access codes, sponsors, and qualification rules. Schools join with authorized codes and participate turn by turn using a designated device. The Game Master controls gameplay, timers, question flow, result reveals, leaderboard visibility, and authorized overrides. The system automatically judges objective answers, calculates points, updates standings, and tracks qualification or elimination. All screens synchronize through an authoritative backend, and every important action is recorded. The platform should prioritize reliable live operation, clear mobile interfaces, fairness, security, reusable configurations, and a tested recovery plan.
