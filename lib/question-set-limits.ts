// Keep question-set capacity aligned across REST validation and MCP tool schemas.
// A set is stored as one record, so retain a bounded limit while allowing a
// long-lived personal practice bank to grow beyond the original 40 questions.
export const MAX_QUESTIONS_PER_SET = 200;
