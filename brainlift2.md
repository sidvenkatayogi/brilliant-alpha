# BrainLift — The Science of Durable Learning (and What It Demands of AI-Driven Education)

> A BrainLift is structured context for AI conversations. This one distills ten foundational education-research papers into a defensible knowledge base, a set of original insights, and a handful of strong, contrarian points of view — so any AI grounded in this document optimizes for *durable learning*, not momentary performance.

---

## Owners

- **[Your name / handle here]** — primary author & maintainer
- *Note for maintainers:* The Knowledge Tree (DOK 2) and Experts sections are the stable foundation; the Insights (DOK 3) and Spiky POVs (DOK 4) are the part that should keep evolving as you read more and pressure-test these claims against real outcome data.

---

## Purpose

### Purpose

The purpose of this BrainLift is to establish an **evidence-grounded model of how durable learning actually happens**, and to use that model to stress-test **AI-driven, mastery-based education systems** — the kind built around an "explicit lesson → mastery quiz → spaced review → coach" loop.

The North Star is a single discipline: **separate the mechanisms the science strongly endorses from the metrics and marketing claims it warns against.** The literature gives a remarkably coherent prescription — guide novices explicitly, then force effortful, spaced retrieval — but it also exposes a trap: the metrics that are easiest to capture in real time (accuracy, fluency, speed, confidence, engagement) are precisely the ones that mislead about whether learning lasts. Any AI conversation grounded in this BrainLift should reason from that tension, not around it.

### In Scope

- The cognitive architecture of learning: working memory limits, long-term memory, and schemas.
- The best-evidenced levers: retrieval practice, spaced/distributed practice, worked examples, explicit instruction.
- The **learning-versus-performance** distinction and its consequences for dashboards and "mastery" gates.
- The role of domain knowledge as the substrate of higher-order thinking.
- What great teaching/coaching consists of, ranked by strength of evidence.
- Design implications for AI-mediated, mastery-gated learning systems.

### Out of Scope

- Reviewing or endorsing any specific vendor's *headline outcome multipliers* (e.g., "2.6x growth," "100% of students score top marks"). These are treated here only as examples of the *kind of metric the science cautions against over-reading*, not as validated facts.
- Learning-styles theory, "brain-based" pedagogy fads, and other claims the cited researchers have flagged as unsupported.
- A full meta-analysis or systematic review — this BrainLift curates and synthesizes ten anchor papers, it does not re-derive the field.
- Engagement, gamification, and motivation mechanics as ends in themselves (they appear only where they intersect with durable learning).

---

## DOK 4: Spiky Points of View (SPOVs)

> Strong, defensible, somewhat contrarian stances built by overlapping the DOK 3 Insights below. These are the claims a generic model is unlikely to assert with conviction.

- **SPOV 1 — The dashboard is the disease. Most AI-education products optimize the one variable the science says is a mirage.**
   - **Elaboration:** A mastery gate set at "90% on first pass" measures *performance* — temporary, observable accuracy during acquisition — which Soderstrom & Bjork show is "often an unreliable index" of *learning* (durable retention and transfer). An AI that rewards visible progress, speed, and confidence is structurally pulled toward massed, blocked, cue-rich practice: the exact conditions that inflate short-term scores while building little storage strength. The fix is not a better dashboard but a different *unit of measurement*: mastery should be defined as **delayed, interleaved re-demonstration**, weeks later, on novel surface structures — not first-pass accuracy. Until a system instruments retention-at-a-lag and transfer, its core metric is optimizing for the illusion of learning. This is spiky because the entire category sells on real-time dashboards and "watch them improve" narratives.

- **SPOV 2 — "Self-directed, personalized learning" is a reward for expertise, not a method for producing it.**
   - **Elaboration:** The dominant edtech vision celebrates personalized, AI-driven, self-directed journeys. But Kirschner, Sweller & Clark show that minimally guided instruction *fails for novices* because unguided search overwhelms working memory and builds no schema. Guidance can only be relaxed as prior knowledge grows — the **expertise-reversal effect**. So self-direction is downstream of competence, not a route to it. The correct AI design is therefore *adaptive guidance that fades*: heavy worked-example scaffolding early, withdrawn precisely as a learner's schema matures. A platform that hands novices autonomy in the name of "personalization" is administering the right medicine at the wrong dose — and calling a bug a feature.

- **SPOV 3 — You cannot offload knowledge to AI and keep the thinking. "Critical thinking" is domain knowledge wearing a costume.**
   - **Elaboration:** Willingham demonstrates that critical thinking is not a transferable, content-free skill; people reason about a problem's *deep structure* only when they have deep, practiced familiarity with the domain (only ~19% spontaneously transferred a solution to a structurally identical problem). Coe et al. independently rank teachers' content knowledge as the attribute with the strongest evidence of impact. The implication cuts hard against the fashionable claim that, because AI can retrieve facts, students no longer need to hold knowledge in their heads. The opposite is true: thinking *is* knowledge-dependent, so a knowledge-rich curriculum is the precondition for the very higher-order skills everyone wants. Every hour spent on a standalone "21st-century skills" module is an hour not spent building the knowledge those skills run on.

- **SPOV 4 — Good learning is supposed to feel bad, which makes student (and AI) satisfaction a dangerous compass.**
   - **Elaboration:** Bjork & Bjork's "desirable difficulties" — spacing, interleaving, generation/testing, varied practice — *depress* visible progress and *feel* less effective, yet roughly triple delayed performance in cases like Rohrer & Taylor's interleaved-formula study. Crucially, learners reliably *prefer the inferior, fluent conditions* and misjudge which one helped them. An AI tuned to satisfaction, retention-of-users, or "frictionless" progress will be dragged toward blocking, massing, and rereading — the demonstrably worse design. A serious learning system must therefore **engineer desirable difficulty on purpose**, even when it dents short-term engagement metrics, and must treat "students love it" as a yellow flag, not a green one.

- **SPOV 5 — If your coaches are mainly motivators, you've assigned your most expensive humans to your least effective lever.**
   - **Elaboration:** Coe et al.'s review of 200+ studies finds the only two "strong evidence" components of great teaching are *content knowledge* and *quality of instruction* (questioning, assessment, scaffolding, review) — and finds that interventions addressing motivation/confidence *before* teaching content have impact on subsequent learning "close to zero." A coaching model whose primary job is encouragement is built on the weakest lever in the evidence base. The highest-leverage redeployment is toward error diagnosis, high-quality questioning, checks for understanding, and structured review. Motivation still matters at the margin (persistence, time-on-task), but as a *complement* to instruction, never a substitute for it.

- **SPOV 6 — The mechanisms are validated; the multipliers are not. Conflating the two is how good science gets used to sell unproven products.**
   - **Elaboration:** The retrieval-plus-spacing core is about as solid as education research gets. But a platform's *headline results* are typically internal, short-horizon **performance** data — the precise metric Soderstrom & Bjork warn overstates durable learning. "We use evidence-based mechanisms" and "we produce a 2.6x outcome" are different claims with very different evidentiary standing. Intellectual honesty requires reporting durable-retention and transfer evidence **separately** from engagement and first-pass numbers, and resisting the temptation to let the well-supported mechanism launder the unproven multiplier.

---

## Experts

> The thinkers behind the Knowledge Tree. Follow their primary work, not the second-hand summaries.

- **John Sweller**
   - **Who:** Emeritus Professor of Education, University of New South Wales (UNSW), Sydney.
   - **Focus:** Originator of **Cognitive Load Theory** — working-memory limits, element interactivity, the worked-example effect, and the expertise-reversal effect as the basis for instructional design.
   - **Why Follow:** He supplies the *mechanism* underneath nearly every other recommendation here (why explicit instruction and worked examples beat discovery for novices). If you understand Sweller, the rest of the field becomes legible.
   - **Where:** https://research.unsw.edu.au/people/emeritus-professor-john-sweller

- **Paul A. Kirschner & Richard E. Clark** (with Sweller)
   - **Who:** Kirschner — Emeritus Professor of Educational Psychology (Open University of the Netherlands); Clark — emeritus, instructional/learning research (USC).
   - **Focus:** The case against minimally guided instruction (discovery, inquiry, problem-based, constructivist) for novices.
   - **Why Follow:** Their 2006 paper is the sharpest articulation of "explicit guidance beats discovery for novices" — and the controversy around it (the charge that they conflate unguided discovery with scaffolded inquiry) is itself worth understanding.
   - **Where:** Search Google Scholar for "Kirschner Sweller Clark 2006 minimal guidance."

- **Barak Rosenshine** (1930–2017)
   - **Who:** Late Professor of Educational Psychology, University of Illinois at Urbana-Champaign.
   - **Focus:** "Principles of Instruction" — translating cognitive science + studies of master teachers into a 10-principle classroom playbook (small steps, modeling, guided practice, high success rate, weekly/monthly review).
   - **Why Follow:** The most practical bridge from theory to teaching procedure; his principles are effectively a spec sheet for the "explicit lesson" stage of a mastery loop.
   - **Where:** "Principles of Instruction," *American Educator* (Spring 2012) — freely available via the AFT.

- **Henry L. Roediger III & Jeffrey D. Karpicke**
   - **Who:** Roediger — James S. McDonnell Distinguished University Professor, Washington University in St. Louis; Karpicke — Professor of Psychological Sciences, Purdue University.
   - **Focus:** The **testing effect** — retrieval itself, not just study, drives long-term retention.
   - **Why Follow:** They supply the foundational experiment for making quizzing the spine of consolidation, *and* the metacognitive twist (restudy raises confidence while testing raises memory).
   - **Where:** https://psychnet.wustl.edu/memory/people/henry-l-roediger-iii/

- **Robert A. Bjork & Elizabeth L. Bjork**
   - **Who:** Distinguished Research Professors of Psychology, UCLA; founders of the Bjork Learning and Forgetting Lab.
   - **Focus:** **Desirable difficulties**; the New Theory of Disuse (storage strength vs. retrieval strength); spacing, interleaving, varied practice, and why learners misjudge their own learning.
   - **Why Follow:** The single best source on *why current performance lies about future memory* — indispensable for anyone designing metrics.
   - **Where:** https://bjorklab.psych.ucla.edu/

- **John Dunlosky**
   - **Who:** Professor of Psychology and Director of the Science of Learning Center, Kent State University.
   - **Focus:** Comparative evidence on study techniques; metacognition and self-regulated learning. Lead author of the 2013 "10 techniques" review (with Rawson, Marsh, Nathan & Willingham).
   - **Why Follow:** He operationalized "evidence strength" for study strategies — the reason we can say *practice testing and distributed practice are high-utility* while rereading and highlighting are not.
   - **Where:** https://www.kent.edu/psychology/profile/john-dunlosky

- **Daniel T. Willingham**
   - **Who:** Professor of Psychology, University of Virginia; author of *Why Don't Students Like School?*
   - **Focus:** Applying cognitive science to K–16 education; why knowledge is the substrate of thinking, and why "critical thinking" resists content-free teaching.
   - **Why Follow:** The clearest writer on the knowledge-vs-skills question — the antidote to "AI means students don't need to know things."
   - **Where:** http://www.danielwillingham.com/

- **Nicholas C. Soderstrom & Robert A. Bjork**
   - **Who:** Soderstrom — learning scientist (cognitive psychology, instruction); with R. Bjork (UCLA).
   - **Focus:** The **learning-versus-performance** distinction — the integrative review that should govern how every learning dashboard is read.
   - **Why Follow:** This is the paper that turns the abstract caution into a measurement mandate: instrument durable change, not acquisition-phase accuracy.
   - **Where:** "Learning Versus Performance: An Integrative Review," *Perspectives on Psychological Science* (2015) — via Google Scholar.

- **Robert Coe** (with C. Aloisi, S. Higgins & L. Elliot Major)
   - **Who:** Professor of Education; co-founder of Evidence Based Education; formerly Durham University (CEM).
   - **Focus:** "What Makes Great Teaching?" (Sutton Trust, 2014) — which teaching practices have real evidence, and which are popular but ineffective.
   - **Why Follow:** The best evidence-graded answer to "what should a great teacher/coach actually *do*," plus a clear list of ineffective practices (lavish praise, discovery for novices, ability grouping, rereading, motivation-before-content).
   - **Where:** Sutton Trust / Evidence Based Education — search "Coe 2014 What Makes Great Teaching Sutton Trust."

- **Harold Pashler** (lead author, IES Practice Guide)
   - **Who:** Distinguished Professor of Psychology, UC San Diego.
   - **Focus:** The government-backed (IES / What Works Clearinghouse) translation of cognitive science into seven graded, actionable recommendations.
   - **Why Follow:** The most honest single document about *evidence grades* — it tells you which recommendations are "Strong" (quizzing-to-re-expose, deep questioning) and which are merely "Low."
   - **Where:** "Organizing Instruction and Study to Improve Student Learning," IES Practice Guide (2007) — ies.ed.gov / What Works Clearinghouse.

---

## DOK 3: Insights

> Original conclusions and connections drawn from the Knowledge Tree. These are the bridge from raw sources to the Spiky POVs above. Grouped thematically.

### A. On architecture and sequence

- **Insight 1:** The ten papers are not ten findings; they are one causal chain. Working memory is the bottleneck (Sweller) → therefore guide novices explicitly with small steps and worked examples (Kirschner/Sweller/Clark; Rosenshine) → once content is in, force retrieval and space it to build storage strength (Roediger/Karpicke; Bjork/Bjork; Dunlosky; Pashler) → none of which works without rich domain knowledge and a knowledgeable instructor (Willingham; Coe) → and you must measure the durable result, not the momentary one (Soderstrom/Bjork). The "explicit lesson → mastery quiz → spaced review → coach" loop is essentially this chain rendered as product architecture.

- **Insight 2:** "Guidance" is not a fixed setting but a *decay curve*. The same intervention (a fully worked example) is optimal for a novice and counterproductive for an expert (the expertise-reversal effect). The design unit that matters is therefore not "how much help" but "how fast help should fade as schema forms."

### B. On the best-evidenced core

- **Insight 3:** Every paper that ranks or grades techniques independently lands on the same two at the top — retrieval and spacing. Convergence across a lab study (Roediger/Karpicke), a utility taxonomy (Dunlosky), a desirable-difficulties framework (Bjork/Bjork), and a government evidence grade (Pashler) is the strongest signal in the entire synthesis. For an AI system, spaced retrieval is not an engagement feature; it is the single highest-leverage mechanism available — *but only if the quizzes demand effortful generation and are genuinely spaced.*

- **Insight 4:** The optimal spacing gap is not fixed; it scales with the target retention horizon. Cepeda et al. found the optimal gap was roughly 20% of the test delay at a few weeks, falling toward ~5% at a one-year delay. A spacing algorithm that ignores the *intended* retention interval is guessing.

### C. On knowledge and thinking

- **Insight 5:** Knowledge is not the enemy of thinking — it is the precondition for it. Willingham (transfer depends on deep familiarity) and Coe (content knowledge is the strongest-evidence teacher attribute) converge so cleanly that "teach generic skills" and "the evidence" point in opposite directions. The corollary for AI: a coherent, cumulative, knowledge-rich curriculum must come first; higher-order thinking is embedded *within* domains, never bolted on beside them.

### D. On measurement (the load-bearing insight)

- **Insight 6:** The metrics easiest to capture in real time — accuracy, fluency, speed, confidence — are exactly the ones that mislead. This is not a footnote; it is the central design risk of any AI that learns from in-session signals. A "mastered" item at first pass and a *retained* item at six weeks are different objects, and only the second is learning.

- **Insight 7:** There is a built-in adversarial dynamic between good pedagogy and engagement-optimizing AI. Desirable difficulties slow visible progress and feel worse; learners actively prefer the inferior conditions. So an AI optimizing for satisfaction or visible speed is not neutral — it is biased *toward the wrong design*, and must be deliberately constrained against its own gradient.

### E. On coaching and honesty

- **Insight 8:** The coach's evidence-backed value is instructional, not motivational. Redeploying coaches from encouragement toward questioning, misconception diagnosis, and structured review moves them from the weakest lever to the strongest.

- **Insight 9:** Evidence strength across these claims is genuinely uneven, and saying so is part of using them well. Retrieval/spacing are rock-solid; interleaving, dual-coding, and spacing-in-classrooms are "Moderate"; pre-questions and study-time allocation are "Low"; and deep-transfer evidence is thinner than surface-retention evidence. A BrainLift that flattens these into one confident "the science says" loses the very calibration that makes it trustworthy.

---

## DOK 2: Knowledge Tree

> The structured foundation: broad categories → sources → DOK 1 facts → DOK 2 summary. Sources are identified by full citation (the canonical reference); verified author/lab pages are linked where available.

### Category 1: Cognitive Architecture & Load (the "why")

- **Subcategory 1.1 — Working memory as the bottleneck**
   - **Source:** Sweller, J. (1988). *Cognitive Load During Problem Solving: Effects on Learning.* Cognitive Science, 12(2), 257–285.
      - **DOK 1 – Facts:**
         - Novices solve problems by means-ends analysis (working backward from the goal, setting subgoals), which is highly demanding of working memory.
         - That demand leaves processing capacity "consequently unavailable for schema acquisition."
         - Worked-example studies (Sweller & Cooper 1985; Cooper & Sweller 1987) show learners taught via worked examples learn faster and transfer better than those who solve equivalent problems.
         - The worked-example effect reverses when examples overload working memory and as expertise grows (expertise-reversal).
      - **DOK 2 – Summary:** Not all struggle is good, as undirected struggle/learning leads to unavailability of processing capacity. Worked examples work better to teach students than telling them to solve a problem, this is true until the examples overload students.
      - **Link to source:** Cognitive Science journal (1988); author page: https://research.unsw.edu.au/people/emeritus-professor-john-sweller

- **Subcategory 1.2 — Why discovery fails for novices**
   - **Source:** Kirschner, P. A., Sweller, J., & Clark, R. E. (2006). *Why Minimal Guidance During Instruction Does Not Work.* Educational Psychologist, 41(2), 75–86.
      - **DOK 1 – Facts:**
         - Discovery, problem-based, inquiry, experiential, and constructivist learning are treated as "pedagogically equivalent" and consistently less effective/efficient than direct, explicit guidance for novices.
         - Mechanism: unguided search overwhelms working memory with activity that builds no long-term schema.
         - Expertise = possession of domain-specific schemas, not generic problem-solving prowess.
         - Critics (Hmelo-Silver; Schmidt et al.) charge the authors conflate genuinely unguided discovery with well-scaffolded PBL/inquiry.
      - **DOK 2 – Summary:** Providing students guides and structure to example problems instead of open problem solving is a more efficient way of teaching. Explicit guidance is better than telling students to solve and explore a problem themselves.
      - **Link to source:** Educational Psychologist (2006) — locate via Google Scholar.

### Category 2: Retrieval & Spacing (the strongest-evidenced core)

- **Subcategory 2.1 — The testing effect**
   - **Source:** Roediger, H. L., & Karpicke, J. D. (2006). *Test-Enhanced Learning.* Psychological Science, 17(3), 249–255.
      - **DOK 1 – Facts:**
         - Students studied prose, then either restudied or took no-feedback recall tests; final tests came at 5 min, 2 days, or 1 week.
         - At 5 minutes, repeated studying won; at a 1-week delay the pattern reversed.
         - Repeated-testing (STTT) beat single-test (SSST) by ~5% and repeated-study (SSSS) by ~21% at the delayed test.
         - Repeated studying *increased confidence* even as it produced *worse* delayed memory — a direct metacognitive illusion.
      - **DOK 2 – Summary:** Even though restudy is more effective in the short term (ex: re-reading lessons), taking tests and retrieving information frequently is a proven stronger method of learning and long term knowledge retention.
      - **Link to source:** Psychological Science (2006); author lab: https://psychnet.wustl.edu/memory/people/henry-l-roediger-iii/

- **Subcategory 2.2 — Desirable difficulties & the storage/retrieval distinction**
   - **Source:** Bjork, E. L., & Bjork, R. A. (2011). *Making Things Hard on Yourself, But in a Good Way.* In *Psychology and the Real World.*
      - **DOK 1 – Facts:**
         - Desirable difficulties include spacing (vs. massing), interleaving (vs. blocking), varying practice conditions, and using tests/generation as study events.
         - The New Theory of Disuse distinguishes *storage strength* (entrenchment) from *retrieval strength* (current accessibility); performance reflects only retrieval strength.
         - In Rohrer & Taylor (2007), interleaving volume-formula practice lowered practice accuracy but roughly tripled delayed scores (~63% vs ~20% a week later, d ≈ 1.34).
         - Learners interleaving paintings learned artists' styles better even though most believed blocking helped more.
      - **DOK 2 – Summary:** Spacing and interleaving are conditions that may slow down the time to learn a concept, but understand better and for longer. Learners prefer more immediate results in short term performance but truly benefit from the former.
      - **Link to source:** Bjork Learning and Forgetting Lab: https://bjorklab.psych.ucla.edu/

- **Subcategory 2.3 — Ranking study techniques by utility**
   - **Source:** Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). *Improving Students' Learning With Effective Learning Techniques.* Psychological Science in the Public Interest, 14(1), 4–58.
      - **DOK 1 – Facts:**
         - *High utility:* practice testing and distributed practice.
         - *Moderate:* elaborative interrogation, self-explanation, interleaved practice.
         - *Low:* summarization, highlighting/underlining, keyword mnemonic, imagery for text, rereading.
         - Techniques benefit only students "motivated and capable of using them"; much underlying evidence measured surface/factual outcomes (a later Donoghue & Hattie meta-analysis, ~169,000 participants, mean effect ~0.56, notes the deep-transfer evidence is thinner).
      - **DOK 2 – Summary:** The best studying techniques are testing and practice. Explaining the topic is a tier below, and the worst ways (although most popular) is passive reading, summarizing, and emphasizing/memorizing text.
      - **Link to source:** PSPI (2013); author page: https://www.kent.edu/psychology/profile/john-dunlosky

- **Subcategory 2.4 — Government-graded recommendations**
   - **Source:** Pashler, H., et al. (2007). *Organizing Instruction and Study to Improve Student Learning* (IES Practice Guide, NCER).
      - **DOK 1 – Facts:**
         - Seven recommendations, each tied to a graded evidence level (Strong / Moderate / Low).
         - *Strong:* (5b) use quizzes/games to re-expose students to key content; (7) help students build explanations via deep questioning.
         - *Moderate:* space learning over time; interleave worked examples with problem-solving; combine graphics with verbal descriptions; connect abstract and concrete representations.
         - *Low:* pre-questions; delayed judgments of learning; using quizzes diagnostically — several rest on lab studies of college students rather than classroom RCTs.
      - **DOK 2 – Summary:** Re-exposing content to students via quizzes and games is a strong way to improve learning, alongside helping students build explanations through guided questioning on key content. Visual + text is a good way to connect abstract and concrete representations and help build learned connections in students.
      - **Link to source:** IES / What Works Clearinghouse (ies.ed.gov), 2007.
   - **Supporting source (spacing dose):** Cepeda et al. meta-analyses — optimal gap ≈ 20% of the retention interval at a few weeks, falling to ≈ 5% at one year.

### Category 3: Knowledge & Thinking

- **Subcategory 3.1 — Why critical thinking resists content-free teaching**
   - **Source:** Willingham, D. T. (2007). *Critical Thinking: Why Is It So Hard to Teach?* American Educator, Summer 2007.
      - **DOK 1 – Facts:**
         - Only ~19% of subjects spontaneously transferred a worked solution to a structurally identical problem (35% even when told it was similar).
         - People focus on a problem's surface structure rather than its deep structure.
         - 3-year-olds can reason about conditional probability while trained scientists fail in unfamiliar contexts.
         - A controlling-variables strategy transferred seven months later, but only when supported by relevant domain knowledge.
      - **DOK 2 – Summary:** Critical thinking is entangled with learning content. To make it a skill that can be transferred across domains with similar problem structures, deep structural understanding of problems should be created before moving to parallel problems in relevant domains.
      - **Link to source:** http://www.danielwillingham.com/ (American Educator, 2007)

### Category 4: Measurement — Learning vs. Performance

- **Subcategory 4.1 — The distinction that governs every dashboard**
   - **Source:** Soderstrom, N. C., & Bjork, R. A. (2015). *Learning Versus Performance: An Integrative Review.* Perspectives on Psychological Science, 10(2), 176–199.
      - **DOK 1 – Facts:**
         - Learning = relatively permanent change supporting long-term retention/transfer; performance = temporary, observable fluctuation during acquisition.
         - Current performance is "often an unreliable index" of learning.
         - Manipulations like spacing, interleaving, varied practice, and reduced feedback depress acquisition performance but improve retention.
         - Learners interpret acquisition performance as a valid index of learning and therefore prefer worse learning conditions.
      - **DOK 2 – Summary:** Think of learning as a long term thing instead of something measured by a point in time (performance).
      - **Link to source:** Perspectives on Psychological Science (2015) — via Google Scholar.

### Category 5: Instruction & Teaching Quality

- **Subcategory 5.1 — The master-teacher playbook**
   - **Source:** Rosenshine, B. (2012). *Principles of Instruction.* American Educator, Spring 2012.
      - **DOK 1 – Facts:**
         - Ten principles: daily review; small steps with practice; many questions/checks; models & worked examples; guided practice; check understanding; ~80% success rate in guided practice; scaffolds; independent practice to automaticity; weekly/monthly review.
         - Most effective math teachers spent ~23 of 40 minutes on lecture/demonstration/questioning/worked examples vs ~11 for the least effective.
         - In a 4th-grade study, the most successful teachers had an 82% success rate vs 73% for the least successful.
         - Classes with weekly quizzes outperformed those with only one or two quizzes per term.
      - **DOK 2 – Summary:** Make bite sized and frequent lessons so students can use the lessons as scaffolding to understanding.
      - **Link to source:** American Educator (Spring 2012) — AFT.

- **Subcategory 5.2 — What actually makes great teaching**
   - **Source:** Coe, R., Aloisi, C., Higgins, S., & Elliot Major, L. (2014). *What Makes Great Teaching?* Sutton Trust / Durham University.
      - **DOK 1 – Facts:**
         - Review of 200+ pieces of research; six components graded by evidence.
         - *Strong evidence:* (1) pedagogical content knowledge; (2) quality of instruction (questioning, assessment, reviewing, modeling, scaffolding, intelligent practice).
         - Ineffective practices flagged: lavish/misdirected praise; discovery for novices; ability grouping; rereading/highlighting; addressing confidence/motivation before teaching content (impact "close to zero").
         - Magnitude: poorer pupils gain ~1.5 years' learning with very effective teachers vs ~0.5 years with poorly performing ones.
      - **DOK 2 – Summary:** The two best-evidenced components of great teaching are content knowledge and quality of instruction. Measurement each has limits and should be triangulated, not used as a single gauge.
      - **Link to source:** Sutton Trust / Evidence Based Education (2014).

---

## Appendix: Caveats carried forward

- **Performance metrics mislead.** Vendor "headline" results (e.g., large growth multipliers, near-universal top scores) are typically internal, short-horizon *performance* data — exactly what the literature warns overstates durable learning. Independent, delayed-retention evidence is the missing piece.
- **The discovery critique is contested.** Kirschner/Sweller/Clark are credibly accused of lumping scaffolded PBL/inquiry with genuinely unguided discovery; the anti-discovery conclusion is strongest for *true minimal guidance with novices*.
- **Evidence grades are uneven.** Only quizzing-to-re-expose and deep questioning earned "Strong" in the IES guide; spacing/interleaving/dual-coding are "Moderate"; pre-questions and study-time allocation are "Low."
- **Boundary conditions apply.** Worked-example and guidance advantages reverse with expertise; desirable difficulties become *undesirable* if learners lack the prior knowledge to meet them — so scaffolding must be adaptive.
- **Motivation still matters at the margin.** "Motivation-first ≈ zero learning impact" does not mean motivation is irrelevant; it aids persistence and time-on-task as a complement to instruction.