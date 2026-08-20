import { TemplateQuestion } from './survey-template.entity';

export interface TemplateSeed {
  key: string;
  name: string;
  /** An industry from INTEREST_CATEGORIES — the tag respondents match on. */
  category: string;
  description: string;
  questions: TemplateQuestion[];
}

/**
 * The survey templates Probocaller ships with — ten per industry.
 *
 * Written against the instruments these sectors actually use rather than
 * invented from scratch, so a business gets questions whose answers mean
 * something next to their own benchmarks: recommendation scored the way NPS
 * scores it, effort the way CES asks it, service quality along the SERVQUAL
 * dimensions, patient experience on the HCAHPS domains and its
 * Always/Usually/Sometimes/Never scale, claims and dealer service along the
 * factors the J.D. Power studies weight, and utilities along reliability,
 * price, billing, communication and customer care.
 *
 * Two rules run through all of them:
 *
 * - Every template is TAGGED with an industry from the shared taxonomy, which
 *   is the same list a respondent picks their interests from. That is what
 *   makes "send me Health surveys" mean something.
 * - Every template MIXES question types. Price per response is the sum of its
 *   question fees, so a library of nothing but yes/no would cap what a
 *   respondent can earn from answering.
 *
 * Seeded on boot by SurveyTemplateService.seedDefaultTemplates(), which only
 * ever adds keys that are missing — an admin's edits to a shipped template
 * survive the next deploy.
 */
export const TEMPLATE_LIBRARY: TemplateSeed[] = [

  // ── telecoms ──────────────────────────────────────────────────────

  {
    key: "telecoms-network-quality",
    name: "Network quality and coverage",
    category: "telecoms",
    description: "Where the signal actually fails \u2014 the single biggest reason people switch provider.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate your network coverage where you spend most of your time?", options: ["Excellent", "Good", "Acceptable", "Poor", "Unusable"], required: true },
      { type: "multi_select", prompt: "Where do you lose signal or data?", options: ["At home", "At work", "While commuting", "Rural areas", "Indoors in malls or basements", "I rarely lose signal"], required: false },
      { type: "multiple_choice", prompt: "How often do calls drop or fail to connect?", options: ["Never", "Rarely", "Weekly", "Daily", "Several times a day"], required: true },
      { type: "free_text", prompt: "Where does the network let you down most?", required: false },
    ],
  },
  {
    key: "telecoms-billing-clarity",
    name: "Billing clarity and surprises",
    category: "telecoms",
    description: "Unexpected charges are a top churn driver \u2014 this finds the ones people cannot explain.",
    questions: [
      { type: "yes_no", prompt: "Was your last bill the amount you expected?", required: true },
      { type: "multi_select", prompt: "Which charges have surprised you?", options: ["Out-of-bundle data", "Roaming", "Premium SMS or subscriptions", "Handset instalment", "Late payment fee", "None"], required: false },
      { type: "multiple_choice", prompt: "How easy is it to understand your bill?", options: ["Very easy", "Easy", "Neither", "Difficult", "Very difficult"], required: true },
      { type: "free_text", prompt: "What would make your bill clearer?", required: false },
    ],
  },
  {
    key: "telecoms-support-experience",
    name: "Customer support experience",
    category: "telecoms",
    description: "Effort, not friendliness, is what predicts whether someone stays after contacting support.",
    questions: [
      { type: "multiple_choice", prompt: "How easy was it to get your issue handled?", options: ["Very easy", "Easy", "Neither", "Difficult", "Very difficult"], required: true },
      { type: "multiple_choice", prompt: "How many times did you have to make contact before it was resolved?", options: ["Once", "Twice", "Three times", "More than three", "It is still unresolved"], required: true },
      { type: "multi_select", prompt: "How did you get in touch?", options: ["Call centre", "WhatsApp", "App or self-service", "Social media", "Store", "Email"], required: false },
      { type: "free_text", prompt: "What would have made it easier?", required: false },
    ],
  },
  {
    key: "telecoms-switching-intent",
    name: "Switching intent",
    category: "telecoms",
    description: "Who is about to leave, and what a competitor is offering them.",
    questions: [
      { type: "multiple_choice", prompt: "How likely are you to still be with your provider in six months?", options: ["Definitely", "Probably", "Not sure", "Probably not", "Definitely not"], required: true },
      { type: "multi_select", prompt: "What would make you switch?", options: ["Cheaper price", "Better coverage", "Better data deal", "Better service", "A handset offer", "Nothing right now"], required: false },
      { type: "yes_no", prompt: "Have you compared another provider in the last three months?", required: true },
      { type: "free_text", prompt: "What is the one thing keeping you where you are?", required: false },
    ],
  },
  {
    key: "telecoms-data-plan-fit",
    name: "Data and plan fit",
    category: "telecoms",
    description: "Whether people are on the wrong plan \u2014 over-paying or constantly running out.",
    questions: [
      { type: "multiple_choice", prompt: "Does your data usually last the month?", options: ["Always", "Usually", "Sometimes", "Rarely", "Never"], required: true },
      { type: "multiple_choice", prompt: "How do you feel about what you pay?", options: ["Good value", "Fair", "A bit expensive", "Far too expensive"], required: true },
      { type: "multi_select", prompt: "What do you use most data on?", options: ["Social media", "Streaming video", "Music", "Work or email", "Gaming", "Downloads"], required: false },
      { type: "free_text", prompt: "What would your ideal plan include?", required: false },
    ],
  },
  {
    key: "telecoms-onboarding",
    name: "Joining and activation",
    category: "telecoms",
    description: "The first hours with a new SIM or contract, where early churn is decided.",
    questions: [
      { type: "multiple_choice", prompt: "How easy was it to get connected?", options: ["Very easy", "Easy", "Neither", "Difficult", "Very difficult"], required: true },
      { type: "yes_no", prompt: "Did everything work on the first day?", required: true },
      { type: "multi_select", prompt: "What went wrong, if anything?", options: ["RICA or verification", "Porting my number", "Data not working", "Wrong package loaded", "Nothing went wrong"], required: false },
      { type: "free_text", prompt: "What would have made joining simpler?", required: false },
    ],
  },
  {
    key: "telecoms-outage",
    name: "Outage and downtime",
    category: "telecoms",
    description: "What people actually experienced during a service interruption, and whether they were told.",
    questions: [
      { type: "yes_no", prompt: "Were you told about the outage before you noticed it?", required: true },
      { type: "multiple_choice", prompt: "How long were you without service?", options: ["Under an hour", "A few hours", "Most of a day", "More than a day", "Several days"], required: true },
      { type: "multiple_choice", prompt: "How well were you kept informed?", options: ["Very well", "Well", "Barely", "Not at all"], required: true },
      { type: "free_text", prompt: "What should they have done differently?", required: false },
    ],
  },
  {
    key: "telecoms-roaming",
    name: "Roaming and travel",
    category: "telecoms",
    description: "How the network behaves abroad, where bill shock is most common.",
    questions: [
      { type: "yes_no", prompt: "Have you used your phone outside the country in the last year?", required: true },
      { type: "multiple_choice", prompt: "How clear were the roaming costs before you travelled?", options: ["Very clear", "Clear", "Unclear", "I had no idea", "I did not check"], required: true },
      { type: "multi_select", prompt: "What did you use abroad?", options: ["Roaming from my provider", "A local SIM", "An eSIM", "Wi-Fi only"], required: false },
      { type: "free_text", prompt: "What would you want to know before your next trip?", required: false },
    ],
  },
  {
    key: "telecoms-device-upgrade",
    name: "Device upgrade",
    category: "telecoms",
    description: "The upgrade moment \u2014 a contract decision point and a common source of confusion.",
    questions: [
      { type: "multiple_choice", prompt: "How long have you had your current phone?", options: ["Under a year", "1\u20132 years", "2\u20133 years", "More than 3 years"], required: true },
      { type: "multiple_choice", prompt: "How clear was the upgrade offer?", options: ["Very clear", "Clear", "Confusing", "I did not understand the terms"], required: true },
      { type: "multi_select", prompt: "What matters most in an upgrade?", options: ["Monthly price", "The handset itself", "Data included", "No upfront cost", "Trade-in value"], required: false },
      { type: "free_text", prompt: "What put you off, or what convinced you?", required: false },
    ],
  },
  {
    key: "telecoms-home-internet",
    name: "Home internet and fibre",
    category: "telecoms",
    description: "Installation and reliability for fixed connections, judged separately from mobile.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate your home connection speed?", options: ["Excellent", "Good", "Acceptable", "Poor"], required: true },
      { type: "multiple_choice", prompt: "How long did installation take from order to working?", options: ["Same week", "1\u20132 weeks", "3\u20134 weeks", "More than a month", "Still waiting"], required: true },
      { type: "yes_no", prompt: "Does the connection handle everyone in the household at once?", required: true },
      { type: "free_text", prompt: "What is the biggest problem with your connection?", required: false },
    ],
  },

  // ── health ────────────────────────────────────────────────────────

  {
    key: "health-visit-overall",
    name: "Visit experience",
    category: "health",
    description: "Overall rating and recommendation, worded as HCAHPS does \u2014 the two questions every facility reports on.",
    questions: [
      { type: "multiple_choice", prompt: "Using any number from 0 to 10, how would you rate this facility overall?", options: ["9\u201310 (best)", "7\u20138", "5\u20136", "3\u20134", "0\u20132 (worst)"], required: true },
      { type: "multiple_choice", prompt: "Would you recommend this facility to friends and family?", options: ["Definitely yes", "Probably yes", "Probably not", "Definitely not"], required: true },
      { type: "multiple_choice", prompt: "How long did you wait past your appointment time?", options: ["No wait", "Under 15 minutes", "15\u201330 minutes", "30\u201360 minutes", "Over an hour"], required: true },
      { type: "free_text", prompt: "What would have improved your visit?", required: false },
    ],
  },
  {
    key: "health-doctor-communication",
    name: "Communication with doctors",
    category: "health",
    description: "The HCAHPS doctor-communication domain: courtesy, listening, and explaining understandably.",
    questions: [
      { type: "multiple_choice", prompt: "How often did doctors treat you with courtesy and respect?", options: ["Always", "Usually", "Sometimes", "Never"], required: true },
      { type: "multiple_choice", prompt: "How often did doctors listen carefully to you?", options: ["Always", "Usually", "Sometimes", "Never"], required: true },
      { type: "multiple_choice", prompt: "How often did doctors explain things in a way you could understand?", options: ["Always", "Usually", "Sometimes", "Never"], required: true },
      { type: "free_text", prompt: "What did you still not understand when you left?", required: false },
    ],
  },
  {
    key: "health-nurse-communication",
    name: "Communication with nurses and staff",
    category: "health",
    description: "The HCAHPS nurse-communication and responsiveness domains.",
    questions: [
      { type: "multiple_choice", prompt: "How often did nurses treat you with courtesy and respect?", options: ["Always", "Usually", "Sometimes", "Never"], required: true },
      { type: "multiple_choice", prompt: "How often did nurses explain things clearly?", options: ["Always", "Usually", "Sometimes", "Never"], required: true },
      { type: "multiple_choice", prompt: "When you needed help, how quickly did you get it?", options: ["Straight away", "Within a few minutes", "After a long wait", "I did not get help"], required: true },
      { type: "free_text", prompt: "Anything you would want the nursing team to know?", required: false },
    ],
  },
  {
    key: "health-access-waiting",
    name: "Getting an appointment",
    category: "health",
    description: "Access and waiting \u2014 the part of care people meet before any clinician.",
    questions: [
      { type: "multiple_choice", prompt: "How long did you wait for an appointment?", options: ["Same day", "A few days", "1\u20132 weeks", "A month or more"], required: true },
      { type: "multiple_choice", prompt: "How easy was it to book?", options: ["Very easy", "Easy", "Difficult", "Very difficult"], required: true },
      { type: "multi_select", prompt: "How did you book?", options: ["Phone", "Walk-in", "App or website", "WhatsApp", "Someone booked for me"], required: false },
      { type: "free_text", prompt: "What would make getting seen easier?", required: false },
    ],
  },
  {
    key: "health-discharge",
    name: "Leaving and follow-up",
    category: "health",
    description: "The HCAHPS discharge-information and care-transition domains, where readmissions begin.",
    questions: [
      { type: "yes_no", prompt: "Were you told what symptoms to watch for after you left?", required: true },
      { type: "yes_no", prompt: "Did you understand what to do about your medicines?", required: true },
      { type: "multiple_choice", prompt: "How well did you understand the plan for your care?", options: ["Completely", "Mostly", "Partly", "Not at all"], required: true },
      { type: "free_text", prompt: "What were you unsure about after leaving?", required: false },
    ],
  },
  {
    key: "health-medicines",
    name: "Medicines and side effects",
    category: "health",
    description: "Whether new medication was explained \u2014 the HCAHPS medicine-communication domain.",
    questions: [
      { type: "yes_no", prompt: "Were you given any new medicine?", required: true },
      { type: "multiple_choice", prompt: "Was it explained what the medicine was for?", options: ["Clearly", "Partly", "Not at all", "I was given none"], required: true },
      { type: "multiple_choice", prompt: "Were possible side effects explained?", options: ["Clearly", "Partly", "Not at all", "I was given none"], required: true },
      { type: "free_text", prompt: "What would you have wanted explained better?", required: false },
    ],
  },
  {
    key: "health-facility",
    name: "Facility comfort and cleanliness",
    category: "health",
    description: "The HCAHPS environment domain \u2014 cleanliness and quiet, both linked to overall rating.",
    questions: [
      { type: "multiple_choice", prompt: "How clean was the facility?", options: ["Always clean", "Usually clean", "Sometimes clean", "Not clean"], required: true },
      { type: "multiple_choice", prompt: "How quiet was it at night or while you waited?", options: ["Always quiet", "Usually quiet", "Sometimes noisy", "Very noisy"], required: true },
      { type: "multi_select", prompt: "What needed attention?", options: ["Toilets", "Waiting area", "Ward or room", "Parking", "Signage", "Nothing"], required: false },
      { type: "free_text", prompt: "What stood out, good or bad?", required: false },
    ],
  },
  {
    key: "health-billing",
    name: "Billing and medical aid",
    category: "health",
    description: "The administrative side, where trust is often lost after good clinical care.",
    questions: [
      { type: "yes_no", prompt: "Did you know what you would pay before treatment?", required: true },
      { type: "multiple_choice", prompt: "How clear was the account you received?", options: ["Very clear", "Clear", "Confusing", "I could not work it out"], required: true },
      { type: "multi_select", prompt: "What went wrong, if anything?", options: ["Claim rejected", "Charged more than quoted", "Slow refund", "Wrong details", "Nothing"], required: false },
      { type: "free_text", prompt: "What would make the money side less stressful?", required: false },
    ],
  },
  {
    key: "health-telehealth",
    name: "Virtual consultation",
    category: "health",
    description: "Remote care judged on its own terms rather than against an in-person visit.",
    questions: [
      { type: "yes_no", prompt: "Have you had a consultation by phone or video?", required: true },
      { type: "multiple_choice", prompt: "How did it compare to seeing someone in person?", options: ["Better", "About the same", "Worse", "Much worse"], required: true },
      { type: "multi_select", prompt: "What would you use a virtual visit for?", options: ["Repeat prescriptions", "Test results", "A new symptom", "Mental health", "Follow-up", "Nothing"], required: false },
      { type: "free_text", prompt: "What would make virtual care work better for you?", required: false },
    ],
  },
  {
    key: "health-pharmacy",
    name: "Pharmacy and prescriptions",
    category: "health",
    description: "Collecting medicine \u2014 frequent, low-drama, and a common point of failure.",
    questions: [
      { type: "multiple_choice", prompt: "How long did you wait to collect?", options: ["Under 10 minutes", "10\u201330 minutes", "30\u201360 minutes", "Over an hour"], required: true },
      { type: "yes_no", prompt: "Was your medicine in stock?", required: true },
      { type: "multiple_choice", prompt: "How well was the medicine explained at the counter?", options: ["Very well", "Adequately", "Barely", "Not at all"], required: true },
      { type: "free_text", prompt: "What would improve collecting your medicine?", required: false },
    ],
  },

  // ── insurance ─────────────────────────────────────────────────────

  {
    key: "insurance-claim-overall",
    name: "Claim experience",
    category: "insurance",
    description: "The whole claim journey, rated the way J.D. Power weights it \u2014 trust and fairness first.",
    questions: [
      { type: "multiple_choice", prompt: "Overall, how satisfied were you with how your claim was handled?", options: ["Very satisfied", "Satisfied", "Neither", "Dissatisfied", "Very dissatisfied"], required: true },
      { type: "multiple_choice", prompt: "How much do you trust your insurer after this claim?", options: ["More than before", "The same", "Less than before", "I no longer trust them"], required: true },
      { type: "multiple_choice", prompt: "How long did the claim take to settle?", options: ["Under a week", "1\u20132 weeks", "3\u20134 weeks", "1\u20133 months", "Longer than 3 months"], required: true },
      { type: "free_text", prompt: "What was the worst part of the process?", required: false },
    ],
  },
  {
    key: "insurance-settlement-fairness",
    name: "Fairness of settlement",
    category: "insurance",
    description: "The single highest-weighted factor in property claims satisfaction.",
    questions: [
      { type: "multiple_choice", prompt: "Was the settlement what you expected?", options: ["More than expected", "About right", "Less than expected", "Far less than expected"], required: true },
      { type: "yes_no", prompt: "Was it explained how the amount was worked out?", required: true },
      { type: "multiple_choice", prompt: "How fair did the outcome feel?", options: ["Completely fair", "Mostly fair", "Somewhat unfair", "Completely unfair"], required: true },
      { type: "free_text", prompt: "What would have made it feel fair?", required: false },
    ],
  },
  {
    key: "insurance-claim-start",
    name: "Starting a claim",
    category: "insurance",
    description: "First Notice of Loss \u2014 the moment people are most stressed and least patient.",
    questions: [
      { type: "multiple_choice", prompt: "How easy was it to start your claim?", options: ["Very easy", "Easy", "Difficult", "Very difficult"], required: true },
      { type: "multi_select", prompt: "How did you start it?", options: ["Phone", "App", "Website", "Broker", "WhatsApp", "In person"], required: false },
      { type: "multiple_choice", prompt: "How quickly did someone come back to you?", options: ["Same day", "Next day", "Within a week", "Longer", "Nobody did"], required: true },
      { type: "free_text", prompt: "What would have made starting easier?", required: false },
    ],
  },
  {
    key: "insurance-communication",
    name: "Communication during a claim",
    category: "insurance",
    description: "Being kept informed, in the channel the customer chose.",
    questions: [
      { type: "multiple_choice", prompt: "How well were you kept updated?", options: ["Very well", "Well", "Barely", "Not at all"], required: true },
      { type: "yes_no", prompt: "Did you have to chase for updates?", required: true },
      { type: "multi_select", prompt: "How would you prefer to be updated?", options: ["SMS", "WhatsApp", "Email", "Phone call", "App notification"], required: false },
      { type: "free_text", prompt: "What did you want to know that nobody told you?", required: false },
    ],
  },
  {
    key: "insurance-policy-clarity",
    name: "Understanding your cover",
    category: "insurance",
    description: "What people believe they are covered for, which is where disputes start.",
    questions: [
      { type: "multiple_choice", prompt: "How well do you understand what your policy covers?", options: ["Completely", "Mostly", "Partly", "Not at all"], required: true },
      { type: "yes_no", prompt: "Have you ever discovered something was not covered when you needed it?", required: true },
      { type: "multi_select", prompt: "What is unclear to you?", options: ["Excess amounts", "What is excluded", "Claim limits", "Waiting periods", "Nothing is unclear"], required: false },
      { type: "free_text", prompt: "What would you want spelled out more plainly?", required: false },
    ],
  },
  {
    key: "insurance-premium-value",
    name: "Premium and value",
    category: "insurance",
    description: "Whether the price still feels justified, and what people compare it against.",
    questions: [
      { type: "multiple_choice", prompt: "How do you feel about what you pay?", options: ["Good value", "Fair", "A bit expensive", "Far too expensive"], required: true },
      { type: "yes_no", prompt: "Has your premium increased in the last year?", required: true },
      { type: "multiple_choice", prompt: "How likely are you to shop around at renewal?", options: ["Very likely", "Likely", "Unlikely", "Very unlikely"], required: true },
      { type: "free_text", prompt: "What would make the price feel worth it?", required: false },
    ],
  },
  {
    key: "insurance-digital",
    name: "App and self-service",
    category: "insurance",
    description: "The digital channel factor: range of services, ease, clarity, helpfulness.",
    questions: [
      { type: "multi_select", prompt: "What can you do without phoning anyone?", options: ["Get a quote", "Start a claim", "Track a claim", "Change cover", "Download documents", "Nothing"], required: false },
      { type: "multiple_choice", prompt: "How easy is the app or website to use?", options: ["Very easy", "Easy", "Difficult", "I avoid it"], required: true },
      { type: "yes_no", prompt: "Have you ever given up and phoned instead?", required: true },
      { type: "free_text", prompt: "What do you wish you could do yourself?", required: false },
    ],
  },
  {
    key: "insurance-broker",
    name: "Broker and adviser",
    category: "insurance",
    description: "Whether the intermediary earns their place in the chain.",
    questions: [
      { type: "yes_no", prompt: "Do you deal with a broker or adviser?", required: true },
      { type: "multiple_choice", prompt: "How well do they understand what you need?", options: ["Very well", "Well", "Not really", "Not at all"], required: true },
      { type: "multiple_choice", prompt: "How easy are they to reach?", options: ["Very easy", "Easy", "Difficult", "Almost impossible"], required: true },
      { type: "free_text", prompt: "What do you rely on them for?", required: false },
    ],
  },
  {
    key: "insurance-renewal",
    name: "Renewal",
    category: "insurance",
    description: "The annual decision point, and what nearly caused a switch.",
    questions: [
      { type: "yes_no", prompt: "Did you consider changing insurer at your last renewal?", required: true },
      { type: "multi_select", prompt: "What made you consider it?", options: ["Price increase", "A bad claim", "Better offer elsewhere", "Poor service", "I did not consider it"], required: false },
      { type: "multiple_choice", prompt: "How much notice were you given?", options: ["Plenty", "Enough", "Very little", "None \u2014 it just renewed"], required: true },
      { type: "free_text", prompt: "What kept you, or what would have kept you?", required: false },
    ],
  },
  {
    key: "insurance-life-cover",
    name: "Life and funeral cover",
    category: "insurance",
    description: "Long-horizon products where people are least sure what they hold.",
    questions: [
      { type: "multi_select", prompt: "Which cover do you have?", options: ["Life", "Funeral", "Disability", "Critical illness", "Income protection", "None"], required: false },
      { type: "multiple_choice", prompt: "How confident are you that your family knows how to claim?", options: ["Very confident", "Fairly confident", "Not confident", "They would not know"], required: true },
      { type: "yes_no", prompt: "Have you reviewed your cover in the last two years?", required: true },
      { type: "free_text", prompt: "What worries you most about your cover?", required: false },
    ],
  },

  // ── finance ───────────────────────────────────────────────────────

  {
    key: "finance-trust",
    name: "Trust in your bank",
    category: "finance",
    description: "Trust is the highest-weighted factor in retail banking satisfaction, and it has been falling.",
    questions: [
      { type: "multiple_choice", prompt: "How much do you trust your bank to act in your interest?", options: ["Completely", "Mostly", "Somewhat", "Not at all"], required: true },
      { type: "multi_select", prompt: "What has damaged your trust?", options: ["Unexpected fees", "Poor service", "A security incident", "Bad press", "Nothing has"], required: false },
      { type: "multiple_choice", prompt: "How likely are you to recommend your bank?", options: ["9\u201310 (very likely)", "7\u20138", "5\u20136", "3\u20134", "0\u20132 (not at all)"], required: true },
      { type: "free_text", prompt: "What would rebuild or strengthen your trust?", required: false },
    ],
  },
  {
    key: "finance-fees",
    name: "Fees and charges",
    category: "finance",
    description: "Customers who pay unexpected fees are markedly more likely to switch.",
    questions: [
      { type: "yes_no", prompt: "Have you been charged a fee you did not expect in the last year?", required: true },
      { type: "multi_select", prompt: "Which fees have caught you out?", options: ["Monthly account fee", "Overdraft", "Declined debit order", "ATM withdrawal", "Card replacement", "None"], required: false },
      { type: "multiple_choice", prompt: "How clearly are fees explained upfront?", options: ["Very clearly", "Clearly", "Poorly", "Not at all"], required: true },
      { type: "free_text", prompt: "Which charge annoys you most, and why?", required: false },
    ],
  },
  {
    key: "finance-app",
    name: "Banking app and online",
    category: "finance",
    description: "The digital channel, now the main relationship for most customers.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate your banking app?", options: ["Excellent", "Good", "Acceptable", "Poor"], required: true },
      { type: "multi_select", prompt: "What do you do in the app?", options: ["Payments", "Check balance", "Buy airtime or data", "Manage cards", "Apply for credit", "Statements"], required: false },
      { type: "multiple_choice", prompt: "How often does it fail when you need it?", options: ["Never", "Rarely", "Monthly", "Weekly", "Constantly"], required: true },
      { type: "free_text", prompt: "What is missing from the app?", required: false },
    ],
  },
  {
    key: "finance-branch",
    name: "Branch and in-person",
    category: "finance",
    description: "Still preferred by a large minority, and judged very differently to digital.",
    questions: [
      { type: "multiple_choice", prompt: "How long did you wait in branch?", options: ["Under 10 minutes", "10\u201330 minutes", "30\u201360 minutes", "Over an hour"], required: true },
      { type: "multiple_choice", prompt: "Was your reason for visiting resolved?", options: ["Fully", "Partly", "Not at all"], required: true },
      { type: "multi_select", prompt: "Why did you need a branch?", options: ["Something the app cannot do", "A dispute", "Documents or FICA", "I prefer people", "A card problem"], required: false },
      { type: "free_text", prompt: "What would let you avoid the trip next time?", required: false },
    ],
  },
  {
    key: "finance-problem-resolution",
    name: "Resolving a problem",
    category: "finance",
    description: "How complaints are handled \u2014 a distinct, heavily weighted factor.",
    questions: [
      { type: "yes_no", prompt: "Have you raised a problem with your bank in the last year?", required: true },
      { type: "multiple_choice", prompt: "How many contacts did it take?", options: ["One", "Two", "Three", "More than three", "Still unresolved"], required: true },
      { type: "multiple_choice", prompt: "How satisfied were you with the outcome?", options: ["Very satisfied", "Satisfied", "Dissatisfied", "Very dissatisfied"], required: true },
      { type: "free_text", prompt: "What went wrong, and what fixed it?", required: false },
    ],
  },
  {
    key: "finance-fraud",
    name: "Fraud and card security",
    category: "finance",
    description: "The highest-stakes moment in the relationship.",
    questions: [
      { type: "yes_no", prompt: "Have you experienced fraud on your account or card?", required: true },
      { type: "multiple_choice", prompt: "How quickly did the bank respond?", options: ["Immediately", "Within a day", "Within a week", "Too slowly", "They did not"], required: true },
      { type: "multiple_choice", prompt: "Were you refunded?", options: ["In full", "Partly", "Not at all", "Still waiting"], required: true },
      { type: "free_text", prompt: "What would have made you feel safer?", required: false },
    ],
  },
  {
    key: "finance-credit",
    name: "Applying for credit",
    category: "finance",
    description: "Loans, cards and overdrafts \u2014 where clarity and speed matter most.",
    questions: [
      { type: "multi_select", prompt: "What have you applied for in the last year?", options: ["Personal loan", "Credit card", "Overdraft", "Home loan", "Vehicle finance", "Nothing"], required: false },
      { type: "multiple_choice", prompt: "How clear were the terms and total cost?", options: ["Very clear", "Clear", "Confusing", "I did not understand them"], required: true },
      { type: "multiple_choice", prompt: "How long did a decision take?", options: ["Instant", "Same day", "A few days", "Over a week"], required: true },
      { type: "free_text", prompt: "What would you want explained before you sign?", required: false },
    ],
  },
  {
    key: "finance-savings",
    name: "Saving and investing",
    category: "finance",
    description: "Whether people feel guided, and what stops them starting.",
    questions: [
      { type: "multiple_choice", prompt: "How much do you manage to save in a typical month?", options: ["Nothing", "A little", "A reasonable amount", "A lot"], required: true },
      { type: "multi_select", prompt: "What stops you saving more?", options: ["Cost of living", "Debt repayments", "Irregular income", "I do not know where to start", "Nothing"], required: false },
      { type: "yes_no", prompt: "Has your bank ever given you useful saving advice?", required: true },
      { type: "free_text", prompt: "What would help you save more?", required: false },
    ],
  },
  {
    key: "finance-switching",
    name: "Switching intent",
    category: "finance",
    description: "Who is considering leaving, and what would hold them.",
    questions: [
      { type: "multiple_choice", prompt: "How likely are you to change your main bank in the next year?", options: ["Very likely", "Likely", "Unlikely", "Very unlikely"], required: true },
      { type: "multi_select", prompt: "What would make you switch?", options: ["Lower fees", "Better app", "Better service", "Better rates", "A joining offer", "Nothing"], required: false },
      { type: "multiple_choice", prompt: "What makes switching hard?", options: ["Moving debit orders", "Time and paperwork", "Salary deposit", "Nothing \u2014 it is easy"], required: true },
      { type: "free_text", prompt: "What is keeping you where you are?", required: false },
    ],
  },
  {
    key: "finance-money-stress",
    name: "Managing money day to day",
    category: "finance",
    description: "Household financial pressure \u2014 context that makes every other answer readable.",
    questions: [
      { type: "multiple_choice", prompt: "How comfortably do you get to month end?", options: ["Comfortably", "Just about", "It is tight", "I run out before month end"], required: true },
      { type: "multi_select", prompt: "What puts most pressure on your budget?", options: ["Food", "Transport", "Rent or bond", "Debt repayments", "School fees", "Electricity"], required: false },
      { type: "yes_no", prompt: "Do you use a budget you actually stick to?", required: true },
      { type: "free_text", prompt: "What would ease the pressure most?", required: false },
    ],
  },

  // ── retail ────────────────────────────────────────────────────────

  {
    key: "retail-store-visit",
    name: "Store visit experience",
    category: "retail",
    description: "Overall in-store satisfaction across the drivers research consistently finds: service, layout, cleanliness.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate your visit overall?", options: ["Excellent", "Good", "Acceptable", "Poor", "Very poor"], required: true },
      { type: "multiple_choice", prompt: "How easy was it to find what you came for?", options: ["Very easy", "Easy", "Difficult", "I gave up"], required: true },
      { type: "multiple_choice", prompt: "How clean and well kept was the store?", options: ["Very", "Reasonably", "Not very", "Poorly"], required: true },
      { type: "free_text", prompt: "What would have made the visit better?", required: false },
    ],
  },
  {
    key: "retail-availability",
    name: "Stock availability",
    category: "retail",
    description: "Out-of-stocks are one of the strongest predictors of store switching.",
    questions: [
      { type: "yes_no", prompt: "Did you find everything on your list?", required: true },
      { type: "multi_select", prompt: "What was missing?", options: ["Fresh produce", "Meat", "Dairy", "Household basics", "My usual brand", "Nothing"], required: false },
      { type: "multiple_choice", prompt: "What did you do about it?", options: ["Bought an alternative", "Went to another shop", "Went without", "Ordered online"], required: true },
      { type: "free_text", prompt: "What is regularly out of stock?", required: false },
    ],
  },
  {
    key: "retail-price-value",
    name: "Price and value",
    category: "retail",
    description: "Value perception, which drives satisfaction independently of price level.",
    questions: [
      { type: "multiple_choice", prompt: "How do the prices compare to where else you shop?", options: ["Cheaper", "About the same", "More expensive", "Much more expensive"], required: true },
      { type: "multi_select", prompt: "What makes you choose one shop over another?", options: ["Price", "Location", "Range", "Quality", "Loyalty rewards", "Staff"], required: false },
      { type: "yes_no", prompt: "Do promotions actually change where you shop?", required: true },
      { type: "free_text", prompt: "Where do you feel you are overpaying?", required: false },
    ],
  },
  {
    key: "retail-range",
    name: "Range and choice",
    category: "retail",
    description: "Assortment gaps, and the categories worth expanding.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate the range on offer?", options: ["Excellent", "Good", "Limited", "Very limited"], required: true },
      { type: "multi_select", prompt: "What would you like more choice in?", options: ["Fresh food", "Health and beauty", "Household", "Clothing", "Local or artisan brands", "Budget options"], required: false },
      { type: "yes_no", prompt: "Do you shop elsewhere for things they do not stock?", required: true },
      { type: "free_text", prompt: "What do you wish they stocked?", required: false },
    ],
  },
  {
    key: "retail-staff",
    name: "Staff and service",
    category: "retail",
    description: "The employee-service driver, measured on availability and helpfulness rather than politeness.",
    questions: [
      { type: "multiple_choice", prompt: "How easy was it to find someone to help?", options: ["Very easy", "Easy", "Difficult", "I could not find anyone"], required: true },
      { type: "multiple_choice", prompt: "How helpful were the staff?", options: ["Very helpful", "Helpful", "Not very", "Unhelpful"], required: true },
      { type: "yes_no", prompt: "Did anyone greet or acknowledge you?", required: true },
      { type: "free_text", prompt: "Was there anyone who stood out, good or bad?", required: false },
    ],
  },
  {
    key: "retail-checkout",
    name: "Checkout and queues",
    category: "retail",
    description: "The last five minutes, which disproportionately shape the memory of the visit.",
    questions: [
      { type: "multiple_choice", prompt: "How long did you queue?", options: ["No queue", "Under 5 minutes", "5\u201310 minutes", "10\u201320 minutes", "Over 20 minutes"], required: true },
      { type: "multi_select", prompt: "How do you prefer to pay?", options: ["Card", "Cash", "Tap or phone", "Self-checkout", "Store app"], required: false },
      { type: "yes_no", prompt: "Were enough tills open?", required: true },
      { type: "free_text", prompt: "What would speed up checkout?", required: false },
    ],
  },
  {
    key: "retail-online",
    name: "Online and click-and-collect",
    category: "retail",
    description: "The omnichannel path, judged on accuracy and timing.",
    questions: [
      { type: "yes_no", prompt: "Have you ordered online from them?", required: true },
      { type: "multiple_choice", prompt: "Did your order arrive complete and correct?", options: ["Yes, exactly", "Mostly", "Several problems", "It was wrong", "I have not ordered"], required: true },
      { type: "multiple_choice", prompt: "How did the substitutions feel?", options: ["Sensible", "Acceptable", "Poor", "I had none"], required: true },
      { type: "free_text", prompt: "What would make you order online more often?", required: false },
    ],
  },
  {
    key: "retail-returns",
    name: "Returns and refunds",
    category: "retail",
    description: "The recovery moment \u2014 handled well it builds more loyalty than a clean sale.",
    questions: [
      { type: "yes_no", prompt: "Have you returned something in the last year?", required: true },
      { type: "multiple_choice", prompt: "How easy was the return?", options: ["Very easy", "Easy", "Difficult", "Very difficult", "I did not try"], required: true },
      { type: "multiple_choice", prompt: "How long did a refund take?", options: ["Immediately", "A few days", "Over a week", "I never received it"], required: true },
      { type: "free_text", prompt: "What would you change about returns?", required: false },
    ],
  },
  {
    key: "retail-loyalty",
    name: "Loyalty programme",
    category: "retail",
    description: "Whether the rewards scheme actually changes behaviour or just records it.",
    questions: [
      { type: "yes_no", prompt: "Do you use their loyalty card or app?", required: true },
      { type: "multiple_choice", prompt: "How valuable are the rewards?", options: ["Very valuable", "Somewhat", "Not much", "Worthless", "I do not use it"], required: true },
      { type: "multi_select", prompt: "What rewards would you actually use?", options: ["Money off", "Fuel points", "Free delivery", "Early access to deals", "Personalised offers"], required: false },
      { type: "free_text", prompt: "What would make the programme worth using?", required: false },
    ],
  },
  {
    key: "retail-recommend",
    name: "Would you recommend",
    category: "retail",
    description: "A short NPS-style read, worded as Reichheld defined it.",
    questions: [
      { type: "multiple_choice", prompt: "How likely are you to recommend this shop to a friend?", options: ["9\u201310 (very likely)", "7\u20138", "5\u20136", "3\u20134", "0\u20132 (not at all)"], required: true },
      { type: "free_text", prompt: "What is the main reason for your score?", required: true },
      { type: "yes_no", prompt: "Will you shop there again in the next month?", required: true },
    ],
  },

  // ── travel ────────────────────────────────────────────────────────

  {
    key: "travel-stay-overall",
    name: "Stay experience",
    category: "travel",
    description: "Overall hotel satisfaction across the dimensions J.D. Power measures.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate your stay overall?", options: ["Excellent", "Good", "Acceptable", "Poor", "Very poor"], required: true },
      { type: "multiple_choice", prompt: "How likely are you to stay there again?", options: ["Definitely", "Probably", "Probably not", "Definitely not"], required: true },
      { type: "multi_select", prompt: "What was the trip for?", options: ["Holiday", "Work", "Family visit", "Event or wedding", "Passing through"], required: false },
      { type: "free_text", prompt: "What would have made the stay better?", required: false },
    ],
  },
  {
    key: "travel-checkin",
    name: "Check-in and check-out",
    category: "travel",
    description: "A distinct satisfaction dimension, and the first and last impression.",
    questions: [
      { type: "multiple_choice", prompt: "How long did check-in take?", options: ["Under 5 minutes", "5\u201315 minutes", "15\u201330 minutes", "Over 30 minutes"], required: true },
      { type: "yes_no", prompt: "Were your requests or preferences acknowledged?", required: true },
      { type: "multiple_choice", prompt: "How was check-out?", options: ["Quick and easy", "Fine", "Slow", "A problem with the bill"], required: true },
      { type: "free_text", prompt: "What would you change about arriving or leaving?", required: false },
    ],
  },
  {
    key: "travel-room",
    name: "Room condition",
    category: "travel",
    description: "Room condition and cleanliness are the strongest drivers of value perception.",
    questions: [
      { type: "multiple_choice", prompt: "How clean was your room on arrival?", options: ["Spotless", "Clean", "Not clean enough", "Dirty"], required: true },
      { type: "multiple_choice", prompt: "How would you rate the condition of the room?", options: ["Excellent", "Good", "Tired", "Poor"], required: true },
      { type: "multi_select", prompt: "What was missing or broken?", options: ["Wi-Fi", "Air conditioning", "Hot water", "TV", "Toiletries", "Nothing"], required: false },
      { type: "free_text", prompt: "What stood out about the room?", required: false },
    ],
  },
  {
    key: "travel-staff",
    name: "Staff service",
    category: "travel",
    description: "The staff-service dimension, judged on responsiveness and problem handling.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate the staff?", options: ["Excellent", "Good", "Adequate", "Poor"], required: true },
      { type: "yes_no", prompt: "Did you need to ask staff to fix something?", required: true },
      { type: "multiple_choice", prompt: "If so, how well was it handled?", options: ["Immediately and well", "Eventually", "Badly", "Not at all", "I had no issues"], required: true },
      { type: "free_text", prompt: "Did anyone make a difference to your stay?", required: false },
    ],
  },
  {
    key: "travel-food",
    name: "Food and drink",
    category: "travel",
    description: "The food-and-beverage dimension, usually the weakest link in mid-market stays.",
    questions: [
      { type: "yes_no", prompt: "Did you eat at the hotel or venue?", required: true },
      { type: "multiple_choice", prompt: "How would you rate the food?", options: ["Excellent", "Good", "Average", "Poor", "I did not eat there"], required: true },
      { type: "multiple_choice", prompt: "How did the price feel?", options: ["Reasonable", "A bit high", "Far too high"], required: true },
      { type: "free_text", prompt: "What would you change about the food offer?", required: false },
    ],
  },
  {
    key: "travel-connectivity",
    name: "Wi-Fi and connectivity",
    category: "travel",
    description: "Now a core dimension in its own right, and a frequent cause of poor ratings.",
    questions: [
      { type: "multiple_choice", prompt: "How good was the Wi-Fi?", options: ["Excellent", "Good", "Patchy", "Unusable"], required: true },
      { type: "yes_no", prompt: "Was it free?", required: true },
      { type: "multiple_choice", prompt: "Could you work or stream on it?", options: ["Easily", "Just about", "No", "I did not try"], required: true },
      { type: "free_text", prompt: "Where in the property did it fail?", required: false },
    ],
  },
  {
    key: "travel-value",
    name: "Value for the rate paid",
    category: "travel",
    description: "The value dimension, which separates a good stay from a repeat booking.",
    questions: [
      { type: "multiple_choice", prompt: "How was the value for what you paid?", options: ["Excellent", "Good", "Poor", "Very poor"], required: true },
      { type: "yes_no", prompt: "Were there charges you were not expecting?", required: true },
      { type: "multi_select", prompt: "What did you pay extra for?", options: ["Parking", "Breakfast", "Wi-Fi", "Late check-out", "Resort fee", "Nothing"], required: false },
      { type: "free_text", prompt: "What would have made it feel worth the money?", required: false },
    ],
  },
  {
    key: "travel-booking",
    name: "Booking experience",
    category: "travel",
    description: "Where the trip is chosen, and where price trust is won or lost.",
    questions: [
      { type: "multi_select", prompt: "How did you book?", options: ["Hotel website", "Booking site", "Travel agent", "Phone", "Through work"], required: false },
      { type: "multiple_choice", prompt: "How easy was booking?", options: ["Very easy", "Easy", "Difficult", "Very difficult"], required: true },
      { type: "yes_no", prompt: "Was the final price what you first saw advertised?", required: true },
      { type: "free_text", prompt: "What would make booking easier?", required: false },
    ],
  },
  {
    key: "travel-transport",
    name: "Getting there",
    category: "travel",
    description: "The journey leg \u2014 flights, road or rail \u2014 rated separately from the destination.",
    questions: [
      { type: "multi_select", prompt: "How did you travel?", options: ["Flight", "Own car", "Bus", "Train", "Hired car", "Taxi or e-hailing"], required: false },
      { type: "multiple_choice", prompt: "How did the journey go?", options: ["Smooth", "Minor problems", "Significant delays", "It went badly wrong"], required: true },
      { type: "multiple_choice", prompt: "How would you rate the value of the fare?", options: ["Good", "Fair", "Expensive", "Far too expensive"], required: true },
      { type: "free_text", prompt: "What was the worst part of getting there?", required: false },
    ],
  },
  {
    key: "travel-next-trip",
    name: "Planning the next trip",
    category: "travel",
    description: "Forward-looking intent, useful for targeting rather than judging a past stay.",
    questions: [
      { type: "multiple_choice", prompt: "When are you next likely to travel?", options: ["Within a month", "1\u20133 months", "3\u20136 months", "Over 6 months", "No plans"], required: true },
      { type: "multi_select", prompt: "What kind of trip?", options: ["Beach", "City break", "Family visit", "Business", "Adventure or outdoors", "Not sure"], required: false },
      { type: "multiple_choice", prompt: "What decides where you go?", options: ["Price", "Convenience", "Somewhere new", "Family", "Weather"], required: true },
      { type: "free_text", prompt: "What is stopping you booking?", required: false },
    ],
  },

  // ── automotive ────────────────────────────────────────────────────

  {
    key: "automotive-service-visit",
    name: "Service visit",
    category: "automotive",
    description: "Overall dealer or workshop service, across the five CSI factors.",
    questions: [
      { type: "multiple_choice", prompt: "How satisfied were you with the service overall?", options: ["Very satisfied", "Satisfied", "Neither", "Dissatisfied", "Very dissatisfied"], required: true },
      { type: "multiple_choice", prompt: "Was the work done right the first time?", options: ["Yes, completely", "Mostly", "No, it came back", "No, still not fixed"], required: true },
      { type: "multiple_choice", prompt: "Was the car ready when promised?", options: ["Early", "On time", "A little late", "Much later than promised"], required: true },
      { type: "free_text", prompt: "What would have improved the visit?", required: false },
    ],
  },
  {
    key: "automotive-service-advisor",
    name: "Service advisor",
    category: "automotive",
    description: "Four of the ten most influential CSI indicators are advisor communication.",
    questions: [
      { type: "yes_no", prompt: "Did someone attend to you promptly when you arrived?", required: true },
      { type: "multiple_choice", prompt: "How well were you kept informed while the car was in?", options: ["Very well", "Well", "Barely", "Not at all"], required: true },
      { type: "yes_no", prompt: "Did anyone contact you after the service to check it was right?", required: true },
      { type: "free_text", prompt: "What did you want to be told that you were not?", required: false },
    ],
  },
  {
    key: "automotive-booking",
    name: "Booking the service",
    category: "automotive",
    description: "Service initiation \u2014 the first CSI touchpoint.",
    questions: [
      { type: "multiple_choice", prompt: "How easy was it to book?", options: ["Very easy", "Easy", "Difficult", "Very difficult"], required: true },
      { type: "multiple_choice", prompt: "How long did you wait for a slot?", options: ["Same week", "1\u20132 weeks", "3\u20134 weeks", "Over a month"], required: true },
      { type: "multi_select", prompt: "How did you book?", options: ["Phone", "Website", "App", "WhatsApp", "In person"], required: false },
      { type: "free_text", prompt: "What would make booking easier?", required: false },
    ],
  },
  {
    key: "automotive-handover",
    name: "Collecting your car",
    category: "automotive",
    description: "Vehicle pick-up, a distinct CSI factor and the last impression.",
    questions: [
      { type: "multiple_choice", prompt: "How long did collection take?", options: ["Under 10 minutes", "10\u201330 minutes", "Over 30 minutes"], required: true },
      { type: "yes_no", prompt: "Was the work explained to you clearly?", required: true },
      { type: "multiple_choice", prompt: "How was the car returned?", options: ["Clean and as expected", "Fine", "Dirty", "Something was damaged or missing"], required: true },
      { type: "free_text", prompt: "What would you change about handover?", required: false },
    ],
  },
  {
    key: "automotive-cost",
    name: "Cost and quotes",
    category: "automotive",
    description: "Price transparency, the most common source of workshop disputes.",
    questions: [
      { type: "yes_no", prompt: "Did the final bill match the quote?", required: true },
      { type: "multiple_choice", prompt: "How clearly were the costs explained beforehand?", options: ["Very clearly", "Clearly", "Poorly", "Not at all"], required: true },
      { type: "yes_no", prompt: "Were you asked before extra work was done?", required: true },
      { type: "free_text", prompt: "What surprised you on the bill?", required: false },
    ],
  },
  {
    key: "automotive-facility",
    name: "Workshop and waiting area",
    category: "automotive",
    description: "The service-facility factor \u2014 where people wait, often for hours.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate the waiting area?", options: ["Excellent", "Good", "Poor", "I did not wait there"], required: true },
      { type: "multi_select", prompt: "What would make waiting bearable?", options: ["Wi-Fi", "Decent coffee", "Somewhere to work", "A lift or shuttle", "A courtesy car"], required: false },
      { type: "yes_no", prompt: "Was parking and access easy?", required: true },
      { type: "free_text", prompt: "What was the waiting experience like?", required: false },
    ],
  },
  {
    key: "automotive-purchase",
    name: "Buying a vehicle",
    category: "automotive",
    description: "The purchase journey, judged separately from aftersales.",
    questions: [
      { type: "multiple_choice", prompt: "How was the buying experience overall?", options: ["Excellent", "Good", "Poor", "Very poor"], required: true },
      { type: "multiple_choice", prompt: "How much pressure did you feel?", options: ["None", "A little", "A lot", "It put me off"], required: true },
      { type: "multi_select", prompt: "What mattered most in your decision?", options: ["Price", "Monthly payment", "Fuel economy", "Reliability", "Safety", "Looks"], required: false },
      { type: "free_text", prompt: "What nearly stopped you buying?", required: false },
    ],
  },
  {
    key: "automotive-test-drive",
    name: "Test drive",
    category: "automotive",
    description: "A short, specific moment that decides many purchases.",
    questions: [
      { type: "yes_no", prompt: "Did you take a test drive before buying?", required: true },
      { type: "multiple_choice", prompt: "How long was it?", options: ["Under 10 minutes", "10\u201330 minutes", "Over 30 minutes", "Overnight", "I did not test drive"], required: true },
      { type: "yes_no", prompt: "Was it long enough to judge the car?", required: true },
      { type: "free_text", prompt: "What would you have wanted to try?", required: false },
    ],
  },
  {
    key: "automotive-ownership",
    name: "Living with your car",
    category: "automotive",
    description: "Running costs and reliability over time, useful for both makers and insurers.",
    questions: [
      { type: "multiple_choice", prompt: "How old is your car?", options: ["Under 2 years", "2\u20135 years", "5\u201310 years", "Over 10 years"], required: true },
      { type: "multi_select", prompt: "What costs you most to run?", options: ["Fuel", "Servicing", "Tyres", "Insurance", "Repairs", "Finance"], required: false },
      { type: "multiple_choice", prompt: "How reliable has it been?", options: ["Faultless", "Mostly reliable", "A few problems", "Constant trouble"], required: true },
      { type: "free_text", prompt: "What would you tell someone considering the same car?", required: false },
    ],
  },
  {
    key: "automotive-next-vehicle",
    name: "Your next vehicle",
    category: "automotive",
    description: "Purchase intent and what will shape it, including the shift to electric.",
    questions: [
      { type: "multiple_choice", prompt: "When will you next change vehicle?", options: ["Within 6 months", "6\u201312 months", "1\u20133 years", "No plans"], required: true },
      { type: "multiple_choice", prompt: "How likely is your next car to be electric or hybrid?", options: ["Very likely", "Possibly", "Unlikely", "Definitely not"], required: true },
      { type: "multi_select", prompt: "What would put you off electric?", options: ["Charging access", "Price", "Range", "Load shedding", "Resale value", "Nothing"], required: false },
      { type: "free_text", prompt: "What will decide your next choice?", required: false },
    ],
  },

  // ── property ──────────────────────────────────────────────────────

  {
    key: "property-renting",
    name: "Renting experience",
    category: "property",
    description: "The tenant view of the agent and the process.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate the agent you dealt with?", options: ["Excellent", "Good", "Poor", "Very poor"], required: true },
      { type: "multiple_choice", prompt: "How long did it take from application to keys?", options: ["Under a week", "1\u20132 weeks", "3\u20134 weeks", "Over a month"], required: true },
      { type: "multi_select", prompt: "What was frustrating?", options: ["Paperwork", "Deposit size", "Slow responses", "Viewings", "Credit checks", "Nothing"], required: false },
      { type: "free_text", prompt: "What would you change about renting?", required: false },
    ],
  },
  {
    key: "property-maintenance",
    name: "Repairs and maintenance",
    category: "property",
    description: "Landlord responsiveness, the biggest driver of tenant satisfaction.",
    questions: [
      { type: "yes_no", prompt: "Have you reported a maintenance problem in the last year?", required: true },
      { type: "multiple_choice", prompt: "How quickly was it dealt with?", options: ["Same week", "Within a month", "Longer", "Never fixed", "I reported nothing"], required: true },
      { type: "multiple_choice", prompt: "How easy is it to report a problem?", options: ["Very easy", "Easy", "Difficult", "I do not know how"], required: true },
      { type: "free_text", prompt: "What is still not fixed?", required: false },
    ],
  },
  {
    key: "property-buying",
    name: "Buying a home",
    category: "property",
    description: "The purchase journey, which most people go through rarely and blind.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate the estate agent?", options: ["Excellent", "Good", "Poor", "Very poor"], required: true },
      { type: "multiple_choice", prompt: "How long did transfer take?", options: ["Under 2 months", "2\u20133 months", "3\u20136 months", "Over 6 months"], required: true },
      { type: "multi_select", prompt: "What was hardest?", options: ["Getting a bond", "Deposit", "Paperwork", "Slow attorneys", "Finding the right place"], required: false },
      { type: "free_text", prompt: "What surprised you about buying?", required: false },
    ],
  },
  {
    key: "property-bond",
    name: "Home loan process",
    category: "property",
    description: "Bond origination \u2014 long, opaque, and decisive for the sale.",
    questions: [
      { type: "multiple_choice", prompt: "How many lenders did you approach?", options: ["One", "Two", "Three or more", "I used an originator"], required: true },
      { type: "multiple_choice", prompt: "How clear were the costs and rate?", options: ["Very clear", "Clear", "Confusing", "Not explained"], required: true },
      { type: "multiple_choice", prompt: "How long did approval take?", options: ["Under a week", "1\u20132 weeks", "3\u20134 weeks", "Over a month"], required: true },
      { type: "free_text", prompt: "What would have made the bond easier?", required: false },
    ],
  },
  {
    key: "property-viewing",
    name: "Viewing a property",
    category: "property",
    description: "The showing itself, where most decisions are actually made.",
    questions: [
      { type: "multiple_choice", prompt: "How many properties did you view before deciding?", options: ["1\u20132", "3\u20135", "6\u201310", "More than 10"], required: true },
      { type: "multi_select", prompt: "What matters most when you view?", options: ["Condition", "Size", "Light", "Security", "Noise", "Neighbourhood"], required: false },
      { type: "yes_no", prompt: "Did the listing photos match the reality?", required: true },
      { type: "free_text", prompt: "What do listings never tell you?", required: false },
    ],
  },
  {
    key: "property-moving",
    name: "Moving in",
    category: "property",
    description: "The week around the move, and what went wrong.",
    questions: [
      { type: "multiple_choice", prompt: "How did the move go?", options: ["Smoothly", "Minor problems", "Badly", "It was a disaster"], required: true },
      { type: "multi_select", prompt: "What was a problem?", options: ["Utilities not connected", "Property not clean", "Repairs outstanding", "Access or keys", "Movers", "Nothing"], required: false },
      { type: "yes_no", prompt: "Was the property ready as promised?", required: true },
      { type: "free_text", prompt: "What should have been sorted before you arrived?", required: false },
    ],
  },
  {
    key: "property-neighbourhood",
    name: "Your area",
    category: "property",
    description: "Location satisfaction \u2014 what makes people stay or leave a suburb.",
    questions: [
      { type: "multiple_choice", prompt: "How happy are you with where you live?", options: ["Very happy", "Happy", "Unhappy", "Very unhappy"], required: true },
      { type: "multi_select", prompt: "What matters most about your area?", options: ["Safety", "Schools", "Transport", "Shops", "Quiet", "Community"], required: false },
      { type: "multiple_choice", prompt: "How likely are you to move in the next two years?", options: ["Very likely", "Possibly", "Unlikely", "Very unlikely"], required: true },
      { type: "free_text", prompt: "What would make your area better?", required: false },
    ],
  },
  {
    key: "property-levies",
    name: "Levies and body corporate",
    category: "property",
    description: "Sectional title living, where costs are shared and disputes are common.",
    questions: [
      { type: "yes_no", prompt: "Do you pay levies or an HOA fee?", required: true },
      { type: "multiple_choice", prompt: "How do you feel about what you pay?", options: ["Good value", "Fair", "Too high", "Far too high"], required: true },
      { type: "multi_select", prompt: "What should levies cover better?", options: ["Security", "Maintenance", "Cleaning", "Gardens", "Common areas", "Nothing"], required: false },
      { type: "free_text", prompt: "What would you raise at the next AGM?", required: false },
    ],
  },
  {
    key: "property-home-services",
    name: "Home services and repairs",
    category: "property",
    description: "Finding and trusting a tradesperson \u2014 a large, fragmented spend.",
    questions: [
      { type: "multi_select", prompt: "Who have you needed in the last year?", options: ["Plumber", "Electrician", "Painter", "Builder", "Garden service", "Nobody"], required: false },
      { type: "multiple_choice", prompt: "How do you find someone you trust?", options: ["Word of mouth", "Online search", "Social media group", "An app or platform", "I struggle to"], required: true },
      { type: "multiple_choice", prompt: "How did the last job go?", options: ["Well", "Acceptably", "Badly", "I had none"], required: true },
      { type: "free_text", prompt: "What goes wrong most with tradespeople?", required: false },
    ],
  },
  {
    key: "property-security",
    name: "Home security",
    category: "property",
    description: "A dominant concern in South African housing decisions.",
    questions: [
      { type: "multi_select", prompt: "What security do you have?", options: ["Alarm", "Armed response", "Electric fence", "Cameras", "Burglar bars", "None"], required: false },
      { type: "multiple_choice", prompt: "How safe do you feel at home?", options: ["Very safe", "Fairly safe", "Not very safe", "Unsafe"], required: true },
      { type: "yes_no", prompt: "Have you or a neighbour had an incident in the last year?", required: true },
      { type: "free_text", prompt: "What would make you feel safer?", required: false },
    ],
  },

  // ── education ─────────────────────────────────────────────────────

  {
    key: "education-course-quality",
    name: "Course quality",
    category: "education",
    description: "Overall course satisfaction, worded close to national student survey items.",
    questions: [
      { type: "multiple_choice", prompt: "Overall, how satisfied are you with the quality of your course?", options: ["Very satisfied", "Satisfied", "Neither", "Dissatisfied", "Very dissatisfied"], required: true },
      { type: "multiple_choice", prompt: "How intellectually stimulating do you find it?", options: ["Very", "Fairly", "Not very", "Not at all"], required: true },
      { type: "yes_no", prompt: "Would you choose the same course again?", required: true },
      { type: "free_text", prompt: "What would improve the course most?", required: false },
    ],
  },
  {
    key: "education-teaching",
    name: "Teaching quality",
    category: "education",
    description: "Lecturer effectiveness \u2014 explanation, interest and support.",
    questions: [
      { type: "multiple_choice", prompt: "How well do lecturers explain things?", options: ["Very well", "Well", "Poorly", "Very poorly"], required: true },
      { type: "multiple_choice", prompt: "How well do they make the subject interesting?", options: ["Very well", "Well", "Poorly", "Very poorly"], required: true },
      { type: "yes_no", prompt: "Are lecturers available when you need help?", required: true },
      { type: "free_text", prompt: "What do the best lecturers do differently?", required: false },
    ],
  },
  {
    key: "education-feedback",
    name: "Assessment and feedback",
    category: "education",
    description: "The domain that scores lowest in most national student surveys.",
    questions: [
      { type: "multiple_choice", prompt: "How quickly do you get feedback on your work?", options: ["Within a week", "2\u20133 weeks", "A month", "Longer", "I rarely get any"], required: true },
      { type: "multiple_choice", prompt: "How useful is the feedback?", options: ["Very useful", "Useful", "Not very", "Useless"], required: true },
      { type: "yes_no", prompt: "Were the marking criteria clear in advance?", required: true },
      { type: "free_text", prompt: "What would make feedback more useful?", required: false },
    ],
  },
  {
    key: "education-resources",
    name: "Learning resources",
    category: "education",
    description: "Library, labs, materials and equipment.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate the learning resources?", options: ["Excellent", "Good", "Poor", "Very poor"], required: true },
      { type: "multi_select", prompt: "What do you struggle to access?", options: ["Textbooks", "Computers", "Internet", "Lab or studio time", "Quiet study space", "Nothing"], required: false },
      { type: "yes_no", prompt: "Can you get what you need when you need it?", required: true },
      { type: "free_text", prompt: "What resource would make the biggest difference?", required: false },
    ],
  },
  {
    key: "education-online",
    name: "Online learning",
    category: "education",
    description: "Remote and blended study, judged on its own terms.",
    questions: [
      { type: "multiple_choice", prompt: "How much of your course is online?", options: ["None", "Some", "About half", "Most", "All of it"], required: true },
      { type: "multiple_choice", prompt: "How well does online learning work for you?", options: ["Very well", "Well", "Poorly", "Very poorly"], required: true },
      { type: "multi_select", prompt: "What makes online study hard?", options: ["Data costs", "Connection", "Load shedding", "No quiet space", "Motivation", "Nothing"], required: false },
      { type: "free_text", prompt: "What would make online learning work better?", required: false },
    ],
  },
  {
    key: "education-support",
    name: "Student support",
    category: "education",
    description: "Academic and wellbeing support, and whether students know it exists.",
    questions: [
      { type: "multi_select", prompt: "What support have you used?", options: ["Academic advising", "Counselling", "Financial aid", "Disability support", "Careers", "None"], required: false },
      { type: "multiple_choice", prompt: "How easy was it to get help when you needed it?", options: ["Very easy", "Easy", "Difficult", "I could not"], required: true },
      { type: "yes_no", prompt: "Do you know where to go if you are struggling?", required: true },
      { type: "free_text", prompt: "What support is missing?", required: false },
    ],
  },
  {
    key: "education-admin",
    name: "Enrolment and admin",
    category: "education",
    description: "Registration, timetabling and records \u2014 the friction outside the classroom.",
    questions: [
      { type: "multiple_choice", prompt: "How was registration this year?", options: ["Smooth", "A few problems", "Difficult", "A nightmare"], required: true },
      { type: "multi_select", prompt: "What went wrong?", options: ["Long queues", "System failures", "Wrong modules", "Missing records", "Fee clearance", "Nothing"], required: false },
      { type: "multiple_choice", prompt: "How quickly does admin answer queries?", options: ["Same day", "A few days", "Weeks", "Never"], required: true },
      { type: "free_text", prompt: "What would you fix about admin first?", required: false },
    ],
  },
  {
    key: "education-fees",
    name: "Fees and funding",
    category: "education",
    description: "Cost, funding and the pressure it puts on completion.",
    questions: [
      { type: "multi_select", prompt: "How is your study funded?", options: ["Family", "NSFAS or bursary", "Loan", "I work", "Employer", "Scholarship"], required: false },
      { type: "multiple_choice", prompt: "How much financial pressure are you under?", options: ["None", "Some", "A lot", "I may have to drop out"], required: true },
      { type: "yes_no", prompt: "Do you feel the course is worth what it costs?", required: true },
      { type: "free_text", prompt: "What would ease the financial pressure?", required: false },
    ],
  },
  {
    key: "education-careers",
    name: "Career readiness",
    category: "education",
    description: "Whether study is translating into employability.",
    questions: [
      { type: "multiple_choice", prompt: "How prepared do you feel for work?", options: ["Very prepared", "Fairly", "Not very", "Not at all"], required: true },
      { type: "multi_select", prompt: "What would help most?", options: ["Work experience", "Employer contact", "CV and interview help", "Practical skills", "Networking"], required: false },
      { type: "yes_no", prompt: "Have you had any work placement or internship?", required: true },
      { type: "free_text", prompt: "What do you think employers will expect that you do not have?", required: false },
    ],
  },
  {
    key: "education-recommend",
    name: "Would you recommend",
    category: "education",
    description: "A short recommendation read for institutions.",
    questions: [
      { type: "multiple_choice", prompt: "How likely are you to recommend this institution?", options: ["9\u201310 (very likely)", "7\u20138", "5\u20136", "3\u20134", "0\u20132 (not at all)"], required: true },
      { type: "free_text", prompt: "What is the main reason for your score?", required: true },
      { type: "yes_no", prompt: "Do you expect to complete your qualification here?", required: true },
    ],
  },

  // ── energy ────────────────────────────────────────────────────────

  {
    key: "energy-reliability",
    name: "Reliability and outages",
    category: "energy",
    description: "Power quality and reliability, the highest-weighted utility satisfaction factor.",
    questions: [
      { type: "multiple_choice", prompt: "How often do you lose power, outside scheduled cuts?", options: ["Never", "Monthly", "Weekly", "Several times a week", "Daily"], required: true },
      { type: "multiple_choice", prompt: "How long do outages usually last?", options: ["Under an hour", "1\u20134 hours", "4\u201312 hours", "Over a day"], required: true },
      { type: "multi_select", prompt: "What does an outage cost you?", options: ["Spoiled food", "Lost work", "Damaged appliances", "Water pump", "Nothing much"], required: false },
      { type: "free_text", prompt: "What is the real impact on your household?", required: false },
    ],
  },
  {
    key: "energy-outage-comms",
    name: "Outage communication",
    category: "energy",
    description: "Customers who receive outage information rate their utility markedly higher.",
    questions: [
      { type: "yes_no", prompt: "Are you told in advance about planned outages?", required: true },
      { type: "multiple_choice", prompt: "How do you find out about an outage?", options: ["SMS or app", "Social media", "Neighbours", "I just notice", "Nobody tells me"], required: true },
      { type: "multiple_choice", prompt: "How accurate are restoration estimates?", options: ["Accurate", "Roughly right", "Usually wrong", "I never get one"], required: true },
      { type: "free_text", prompt: "What would you want to be told, and how?", required: false },
    ],
  },
  {
    key: "energy-billing",
    name: "Billing and payment",
    category: "energy",
    description: "The billing-and-payment factor, and where disputes originate.",
    questions: [
      { type: "multiple_choice", prompt: "How clear is your electricity bill?", options: ["Very clear", "Clear", "Confusing", "I cannot follow it"], required: true },
      { type: "yes_no", prompt: "Have you had an estimated or disputed bill in the last year?", required: true },
      { type: "multi_select", prompt: "How do you pay?", options: ["Prepaid", "Debit order", "App or online", "In person", "Through the landlord"], required: false },
      { type: "free_text", prompt: "What would you change about billing?", required: false },
    ],
  },
  {
    key: "energy-price",
    name: "Price and affordability",
    category: "energy",
    description: "Rising cost is the primary driver of falling utility satisfaction.",
    questions: [
      { type: "multiple_choice", prompt: "How affordable is your electricity?", options: ["Comfortable", "Manageable", "A struggle", "I cannot afford it"], required: true },
      { type: "multiple_choice", prompt: "What share of your monthly budget goes to energy?", options: ["Under 5%", "5\u201310%", "10\u201320%", "Over 20%"], required: true },
      { type: "yes_no", prompt: "Have you cut back on usage because of cost?", required: true },
      { type: "free_text", prompt: "What have you had to give up to pay for power?", required: false },
    ],
  },
  {
    key: "energy-customer-care",
    name: "Customer service",
    category: "energy",
    description: "The customer-care factor: reaching someone, and getting it resolved.",
    questions: [
      { type: "yes_no", prompt: "Have you contacted your utility in the last year?", required: true },
      { type: "multiple_choice", prompt: "How easy was it to reach someone?", options: ["Very easy", "Easy", "Difficult", "Impossible"], required: true },
      { type: "multiple_choice", prompt: "Was your issue resolved?", options: ["Fully", "Partly", "Not at all", "I gave up"], required: true },
      { type: "free_text", prompt: "What happened when you contacted them?", required: false },
    ],
  },
  {
    key: "energy-meter",
    name: "Meters and readings",
    category: "energy",
    description: "Metering accuracy, a persistent source of mistrust.",
    questions: [
      { type: "multiple_choice", prompt: "What kind of meter do you have?", options: ["Prepaid", "Smart meter", "Old-style meter", "I do not know"], required: true },
      { type: "yes_no", prompt: "Do you trust your meter to be accurate?", required: true },
      { type: "multiple_choice", prompt: "How often is your meter actually read?", options: ["Monthly", "Occasionally", "Never", "It is prepaid"], required: true },
      { type: "free_text", prompt: "Any problems with your meter?", required: false },
    ],
  },
  {
    key: "energy-prepaid",
    name: "Prepaid electricity",
    category: "energy",
    description: "The prepaid experience, which most households now use.",
    questions: [
      { type: "yes_no", prompt: "Do you buy prepaid electricity?", required: true },
      { type: "multi_select", prompt: "Where do you buy it?", options: ["Banking app", "Retail store", "Vendor or spaza", "Utility app", "ATM"], required: false },
      { type: "multiple_choice", prompt: "How often do you run out unexpectedly?", options: ["Never", "Rarely", "Monthly", "Often"], required: true },
      { type: "free_text", prompt: "What would make buying power easier?", required: false },
    ],
  },
  {
    key: "energy-solar",
    name: "Solar and backup power",
    category: "energy",
    description: "Adoption and intent for alternative supply.",
    questions: [
      { type: "multi_select", prompt: "What backup do you have?", options: ["Solar panels", "Inverter and batteries", "Generator", "Gas", "UPS", "None"], required: false },
      { type: "multiple_choice", prompt: "How likely are you to install solar in the next two years?", options: ["Very likely", "Possibly", "Unlikely", "Already have it"], required: true },
      { type: "multi_select", prompt: "What holds you back?", options: ["Upfront cost", "Renting my home", "Do not understand it", "Trust in installers", "Nothing"], required: false },
      { type: "free_text", prompt: "What would make solar make sense for you?", required: false },
    ],
  },
  {
    key: "energy-efficiency",
    name: "Saving energy",
    category: "energy",
    description: "Whether households have practical ways to reduce usage.",
    questions: [
      { type: "multi_select", prompt: "What have you done to use less?", options: ["Gas cooking", "LED lights", "Geyser timer", "Solar geyser", "Using less heating", "Nothing"], required: false },
      { type: "multiple_choice", prompt: "How much do you know about where your power goes?", options: ["A lot", "Some", "Very little", "Nothing"], required: true },
      { type: "yes_no", prompt: "Would you change usage times if it were cheaper?", required: true },
      { type: "free_text", prompt: "What would help you cut your bill?", required: false },
    ],
  },
  {
    key: "energy-recommend",
    name: "Overall satisfaction",
    category: "energy",
    description: "A short overall read on the utility relationship.",
    questions: [
      { type: "multiple_choice", prompt: "Overall, how satisfied are you with your electricity supplier?", options: ["Very satisfied", "Satisfied", "Dissatisfied", "Very dissatisfied"], required: true },
      { type: "yes_no", prompt: "Would you switch supplier if you could?", required: true },
      { type: "free_text", prompt: "What is the single biggest thing they should fix?", required: true },
    ],
  },

  // ── food ──────────────────────────────────────────────────────────

  {
    key: "food-restaurant-visit",
    name: "Restaurant visit",
    category: "food",
    description: "Overall dining satisfaction, across food, service and setting.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate your visit overall?", options: ["Excellent", "Good", "Acceptable", "Poor", "Very poor"], required: true },
      { type: "multiple_choice", prompt: "How was the food itself?", options: ["Excellent", "Good", "Average", "Poor"], required: true },
      { type: "multiple_choice", prompt: "How long did you wait to be served?", options: ["No wait", "Under 10 minutes", "10\u201320 minutes", "Over 20 minutes"], required: true },
      { type: "free_text", prompt: "What would have made the meal better?", required: false },
    ],
  },
  {
    key: "food-delivery",
    name: "Delivery experience",
    category: "food",
    description: "The delivery journey, judged on time, temperature and accuracy.",
    questions: [
      { type: "multiple_choice", prompt: "How long did your order take?", options: ["Under 30 minutes", "30\u201345 minutes", "45\u201360 minutes", "Over an hour"], required: true },
      { type: "multiple_choice", prompt: "How did the food arrive?", options: ["Hot and intact", "Acceptable", "Cold", "Damaged or spilled"], required: true },
      { type: "yes_no", prompt: "Was the order complete and correct?", required: true },
      { type: "free_text", prompt: "What went wrong, if anything?", required: false },
    ],
  },
  {
    key: "food-quality",
    name: "Food quality and taste",
    category: "food",
    description: "Product quality on its own, separated from service and speed.",
    questions: [
      { type: "multiple_choice", prompt: "How would you rate the taste?", options: ["Excellent", "Good", "Average", "Poor"], required: true },
      { type: "multiple_choice", prompt: "How consistent is it visit to visit?", options: ["Always the same", "Usually", "Varies a lot", "Unpredictable"], required: true },
      { type: "multiple_choice", prompt: "How were the portions for the price?", options: ["Generous", "Fair", "Small", "Very small"], required: true },
      { type: "free_text", prompt: "What is their best and worst dish?", required: false },
    ],
  },
  {
    key: "food-menu",
    name: "Menu and dietary needs",
    category: "food",
    description: "Range, and whether particular diets are actually catered for.",
    questions: [
      { type: "multi_select", prompt: "Do you have any dietary requirements?", options: ["Halaal", "Kosher", "Vegetarian", "Vegan", "Gluten free", "Allergies", "None"], required: false },
      { type: "multiple_choice", prompt: "How well were they catered for?", options: ["Very well", "Adequately", "Poorly", "Not at all", "Not applicable"], required: true },
      { type: "multiple_choice", prompt: "How would you rate the menu range?", options: ["Excellent", "Good", "Limited", "Very limited"], required: true },
      { type: "free_text", prompt: "What would you add to the menu?", required: false },
    ],
  },
  {
    key: "food-value",
    name: "Value for money",
    category: "food",
    description: "Price perception, which drives repeat visits more than absolute price.",
    questions: [
      { type: "multiple_choice", prompt: "How did the price feel for what you got?", options: ["Great value", "Fair", "Expensive", "Far too expensive"], required: true },
      { type: "multiple_choice", prompt: "How often do you eat out or order in?", options: ["Several times a week", "Weekly", "Monthly", "Rarely"], required: true },
      { type: "multi_select", prompt: "What makes you choose a place?", options: ["Price", "Taste", "Speed", "Location", "Reviews", "Habit"], required: false },
      { type: "free_text", prompt: "What would make it feel worth the money?", required: false },
    ],
  },
  {
    key: "food-order-accuracy",
    name: "Order accuracy",
    category: "food",
    description: "Getting the order right \u2014 the most common and most fixable failure.",
    questions: [
      { type: "yes_no", prompt: "Was your last order exactly what you asked for?", required: true },
      { type: "multi_select", prompt: "What was wrong?", options: ["Missing item", "Wrong item", "Wrong preparation", "Missing sides or sauce", "Nothing"], required: false },
      { type: "multiple_choice", prompt: "How was it put right?", options: ["Immediately", "Eventually", "Badly", "It was not", "Nothing was wrong"], required: true },
      { type: "free_text", prompt: "How did they handle the mistake?", required: false },
    ],
  },
  {
    key: "food-speed",
    name: "Speed of service",
    category: "food",
    description: "Throughput, particularly for quick-service and takeaway.",
    questions: [
      { type: "multiple_choice", prompt: "How long did you wait from ordering to eating?", options: ["Under 5 minutes", "5\u201315 minutes", "15\u201330 minutes", "Over 30 minutes"], required: true },
      { type: "yes_no", prompt: "Was that about what you expected?", required: true },
      { type: "multiple_choice", prompt: "How would you rate the queue or drive-through?", options: ["Fast", "Acceptable", "Slow", "I left"], required: true },
      { type: "free_text", prompt: "Where did the delay happen?", required: false },
    ],
  },
  {
    key: "food-hygiene",
    name: "Cleanliness and hygiene",
    category: "food",
    description: "Visible hygiene, which shapes trust more than any other single cue.",
    questions: [
      { type: "multiple_choice", prompt: "How clean was the place?", options: ["Spotless", "Clean", "Not clean enough", "Dirty"], required: true },
      { type: "multi_select", prompt: "What needed attention?", options: ["Tables", "Toilets", "Floors", "Staff presentation", "Kitchen visible", "Nothing"], required: false },
      { type: "yes_no", prompt: "Would the cleanliness stop you returning?", required: true },
      { type: "free_text", prompt: "What did you notice?", required: false },
    ],
  },
  {
    key: "food-app",
    name: "Ordering app and collection",
    category: "food",
    description: "The digital ordering path, now the default for many customers.",
    questions: [
      { type: "multi_select", prompt: "How do you usually order?", options: ["In person", "Restaurant app", "Delivery app", "Phone", "WhatsApp", "Website"], required: false },
      { type: "multiple_choice", prompt: "How easy is the app to use?", options: ["Very easy", "Easy", "Frustrating", "I avoid it"], required: true },
      { type: "yes_no", prompt: "Do the deals in the app feel worth it?", required: true },
      { type: "free_text", prompt: "What would make ordering easier?", required: false },
    ],
  },
  {
    key: "food-groceries",
    name: "Weekly food shop",
    category: "food",
    description: "Household food buying \u2014 where the money actually goes.",
    questions: [
      { type: "multiple_choice", prompt: "How much do you spend on food a month?", options: ["Under R1,000", "R1,000\u2013R2,500", "R2,500\u2013R5,000", "R5,000\u2013R10,000", "Over R10,000"], required: true },
      { type: "multi_select", prompt: "What has got noticeably more expensive?", options: ["Meat", "Dairy", "Bread and staples", "Fresh produce", "Cooking oil", "Everything"], required: false },
      { type: "multiple_choice", prompt: "How has your shopping changed with prices?", options: ["Not at all", "Buying cheaper brands", "Buying less", "Changing where I shop", "All of these"], required: true },
      { type: "free_text", prompt: "What have you had to cut back on?", required: false },
    ],
  },

  // ── entertainment ─────────────────────────────────────────────────

  {
    key: "entertainment-streaming",
    name: "Streaming service",
    category: "entertainment",
    description: "Subscription video satisfaction and the churn signal underneath it.",
    questions: [
      { type: "multi_select", prompt: "Which do you subscribe to?", options: ["Netflix", "Showmax", "Disney+", "Amazon Prime", "Apple TV+", "YouTube Premium", "None"], required: false },
      { type: "multiple_choice", prompt: "How satisfied are you with your main service?", options: ["Very satisfied", "Satisfied", "Dissatisfied", "Very dissatisfied"], required: true },
      { type: "multiple_choice", prompt: "How likely are you to cancel in the next three months?", options: ["Very likely", "Possibly", "Unlikely", "Definitely not"], required: true },
      { type: "free_text", prompt: "What would make you cancel?", required: false },
    ],
  },
  {
    key: "entertainment-content",
    name: "Content and range",
    category: "entertainment",
    description: "Whether the library justifies the subscription.",
    questions: [
      { type: "multiple_choice", prompt: "How often do you struggle to find something to watch?", options: ["Never", "Sometimes", "Often", "Almost every time"], required: true },
      { type: "multi_select", prompt: "What do you watch most?", options: ["Series", "Films", "Local content", "Documentaries", "Sport", "Kids content"], required: false },
      { type: "yes_no", prompt: "Is there enough local content?", required: true },
      { type: "free_text", prompt: "What is missing from the library?", required: false },
    ],
  },
  {
    key: "entertainment-price",
    name: "Price and value",
    category: "entertainment",
    description: "Subscription value under cost pressure, and stacking behaviour.",
    questions: [
      { type: "multiple_choice", prompt: "How many services do you pay for?", options: ["One", "Two", "Three", "Four or more", "None"], required: true },
      { type: "multiple_choice", prompt: "How does the price feel?", options: ["Good value", "Fair", "Expensive", "Far too expensive"], required: true },
      { type: "yes_no", prompt: "Have you cancelled a service in the last year because of price?", required: true },
      { type: "free_text", prompt: "What would make it feel worth it?", required: false },
    ],
  },
  {
    key: "entertainment-app-quality",
    name: "App and playback",
    category: "entertainment",
    description: "Technical quality, a leading cause of cancellation that surveys often miss.",
    questions: [
      { type: "multiple_choice", prompt: "How often does playback buffer or fail?", options: ["Never", "Rarely", "Often", "Constantly"], required: true },
      { type: "multiple_choice", prompt: "How much data does streaming cost you a month?", options: ["I do not know", "A little", "A lot", "It is my biggest data use"], required: true },
      { type: "multi_select", prompt: "What do you watch on?", options: ["Phone", "Smart TV", "Laptop", "Tablet", "Streaming stick"], required: false },
      { type: "free_text", prompt: "What annoys you most about the app?", required: false },
    ],
  },
  {
    key: "entertainment-live-events",
    name: "Live events",
    category: "entertainment",
    description: "Concerts, festivals and shows \u2014 ticketing through to the night itself.",
    questions: [
      { type: "yes_no", prompt: "Have you been to a live event in the last year?", required: true },
      { type: "multiple_choice", prompt: "How was the ticket-buying experience?", options: ["Easy", "Acceptable", "Frustrating", "I did not get tickets"], required: true },
      { type: "multi_select", prompt: "What puts you off going?", options: ["Ticket price", "Travel", "Safety", "Queues", "Nothing"], required: false },
      { type: "free_text", prompt: "What would get you to more events?", required: false },
    ],
  },
  {
    key: "entertainment-cinema",
    name: "Cinema",
    category: "entertainment",
    description: "The cinema visit, competing directly with the sofa.",
    questions: [
      { type: "multiple_choice", prompt: "How often do you go to the cinema?", options: ["Monthly or more", "A few times a year", "Once a year", "Never"], required: true },
      { type: "multi_select", prompt: "What would make you go more?", options: ["Cheaper tickets", "Better films", "Closer venue", "Better seats", "Cheaper snacks"], required: false },
      { type: "multiple_choice", prompt: "How does it compare to watching at home?", options: ["Much better", "Better", "About the same", "Worse"], required: true },
      { type: "free_text", prompt: "What stops you going?", required: false },
    ],
  },
  {
    key: "entertainment-gaming",
    name: "Gaming",
    category: "entertainment",
    description: "Play habits and spending, a large and under-surveyed category.",
    questions: [
      { type: "multi_select", prompt: "What do you play on?", options: ["Phone", "Console", "PC", "Tablet", "I do not game"], required: false },
      { type: "multiple_choice", prompt: "How much do you spend on games a month?", options: ["Nothing", "Under R100", "R100\u2013R500", "Over R500"], required: true },
      { type: "multiple_choice", prompt: "How many hours a week do you play?", options: ["Under 2", "2\u20135", "5\u201310", "More than 10"], required: true },
      { type: "free_text", prompt: "What are you playing at the moment?", required: false },
    ],
  },
  {
    key: "entertainment-music",
    name: "Music and podcasts",
    category: "entertainment",
    description: "Audio subscriptions and listening habits.",
    questions: [
      { type: "multi_select", prompt: "How do you listen?", options: ["Spotify", "Apple Music", "YouTube", "Radio", "Downloads", "I do not"], required: false },
      { type: "multiple_choice", prompt: "How much do you listen to podcasts?", options: ["Daily", "Weekly", "Occasionally", "Never"], required: true },
      { type: "yes_no", prompt: "Do you pay for a music subscription?", required: true },
      { type: "free_text", prompt: "What would you pay more for?", required: false },
    ],
  },
  {
    key: "entertainment-sport",
    name: "Sport viewing",
    category: "entertainment",
    description: "Sport rights drive subscription decisions more than any other content.",
    questions: [
      { type: "yes_no", prompt: "Do you follow sport?", required: true },
      { type: "multi_select", prompt: "How do you watch it?", options: ["Pay TV", "Streaming", "Free-to-air", "At a venue", "Highlights only"], required: false },
      { type: "multiple_choice", prompt: "Would you pay for a single-sport subscription?", options: ["Definitely", "Maybe", "No", "I already do"], required: true },
      { type: "free_text", prompt: "What do you struggle to watch?", required: false },
    ],
  },
  {
    key: "entertainment-recommend",
    name: "Would you recommend",
    category: "entertainment",
    description: "A short recommendation read for an entertainment service.",
    questions: [
      { type: "multiple_choice", prompt: "How likely are you to recommend the service you use most?", options: ["9\u201310 (very likely)", "7\u20138", "5\u20136", "3\u20134", "0\u20132 (not at all)"], required: true },
      { type: "free_text", prompt: "What is the main reason for your score?", required: true },
      { type: "yes_no", prompt: "Will you still be subscribed in six months?", required: true },
    ],
  },
];
