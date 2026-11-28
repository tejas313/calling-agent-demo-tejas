import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { PendingCallAction } from '../../common';

export type CallActionResult =
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'CALL_LATER'
  | null;

export interface GraphDecisionOutput {
  response: string;
  isComplete: boolean;
  actionResult: CallActionResult;
  nextPendingAction: PendingCallAction;
}

export interface CallAgentGraphDeps {
  buildGreeting: (isFrench: boolean) => Promise<string> | string;
  normalizeStt: (
    userMessage: string,
    pendingAction: PendingCallAction,
  ) => string;
  tryFastTransition: (
    normalizedUserMessage: string,
    pendingAction: PendingCallAction,
    isFrench: boolean,
  ) => Promise<GraphDecisionOutput | null> | GraphDecisionOutput | null;
  invokeLlm: (
    normalizedUserMessage: string,
    conversationHistory: BaseMessage[],
  ) => Promise<{ rawText: string; llmError?: string }>;
  enforceStateMachine: (
    rawText: string,
    pendingAction: PendingCallAction,
    isFrench: boolean,
  ) => GraphDecisionOutput;
}

export const CallAgentStateAnnotation = Annotation.Root({
  callId: Annotation<string>,
  language: Annotation<string>,
  isFrench: Annotation<boolean>,
  userMessage: Annotation<string>,
  normalizedUserMessage: Annotation<string>,
  conversationHistory: Annotation<BaseMessage[]>,
  pendingAction: Annotation<PendingCallAction>,
  sttHints: Annotation<string[]>,
  intentPath: Annotation<'FAST_PATH' | 'LLM'>,
  fastDecision: Annotation<GraphDecisionOutput | null>,
  rawLlmResponse: Annotation<string>,
  response: Annotation<string>,
  isComplete: Annotation<boolean>,
  actionResult: Annotation<CallActionResult>,
  nextPendingAction: Annotation<PendingCallAction>,
  llmError: Annotation<string | undefined>,
  updatedHistory: Annotation<BaseMessage[]>,
});

export type CallAgentGraphState = typeof CallAgentStateAnnotation.State;

/**
 * Builds and compiles the LangGraph StateGraph for a single AI call turn:
 * - START -> greeting (when LANGUAGE_SELECTED) | normalize_stt
 * - normalize_stt -> fast_transition (deterministic intent) | llm_agent
 * - llm_agent -> enforce_state_machine -> END
 */
export function createCallAgentGraph(deps: CallAgentGraphDeps) {
  const greetingNode = async (
    state: CallAgentGraphState,
  ): Promise<Partial<CallAgentGraphState>> => {
    const greeting = await deps.buildGreeting(state.isFrench);
    return {
      response: greeting,
      isComplete: false,
      actionResult: null,
      nextPendingAction: null,
      intentPath: 'FAST_PATH',
      updatedHistory: [...state.conversationHistory, new AIMessage(greeting)],
    };
  };

  const normalizeSttNode = async (
    state: CallAgentGraphState,
  ): Promise<Partial<CallAgentGraphState>> => {
    const normalized = deps.normalizeStt(
      state.userMessage,
      state.pendingAction ?? null,
    );
    const fastDecision = await deps.tryFastTransition(
      normalized,
      state.pendingAction ?? null,
      state.isFrench,
    );
    return {
      normalizedUserMessage: normalized,
      fastDecision,
    };
  };

  const fastTransitionNode = async (
    state: CallAgentGraphState,
  ): Promise<Partial<CallAgentGraphState>> => {
    const decision = state.fastDecision!;
    const userMsg = state.normalizedUserMessage || state.userMessage;
    return {
      response: decision.response,
      isComplete: decision.isComplete,
      actionResult: decision.actionResult,
      nextPendingAction: decision.nextPendingAction,
      intentPath: 'FAST_PATH',
      updatedHistory: [
        ...state.conversationHistory,
        new HumanMessage(userMsg),
        new AIMessage(decision.response),
      ],
    };
  };

  const llmAgentNode = async (
    state: CallAgentGraphState,
  ): Promise<Partial<CallAgentGraphState>> => {
    const userMsg = state.normalizedUserMessage || state.userMessage;
    const { rawText, llmError } = await deps.invokeLlm(
      userMsg,
      state.conversationHistory,
    );
    return {
      rawLlmResponse: rawText,
      llmError,
    };
  };

  const enforceStateMachineNode = async (
    state: CallAgentGraphState,
  ): Promise<Partial<CallAgentGraphState>> => {
    const resolved = deps.enforceStateMachine(
      state.rawLlmResponse || '',
      state.pendingAction ?? null,
      state.isFrench,
    );
    const userMsg = state.normalizedUserMessage || state.userMessage;
    return {
      response: resolved.response,
      isComplete: resolved.isComplete,
      actionResult: resolved.actionResult,
      nextPendingAction: resolved.nextPendingAction,
      intentPath: 'LLM',
      updatedHistory: [
        ...state.conversationHistory,
        new HumanMessage(userMsg),
        new AIMessage(resolved.response),
      ],
    };
  };

  const graph = new StateGraph(CallAgentStateAnnotation)
    .addNode('greeting', greetingNode)
    .addNode('normalize_stt', normalizeSttNode)
    .addNode('fast_transition', fastTransitionNode)
    .addNode('llm_agent', llmAgentNode)
    .addNode('enforce_state_machine', enforceStateMachineNode)
    .addConditionalEdges(START, (state: CallAgentGraphState) =>
      state.userMessage === 'LANGUAGE_SELECTED' ? 'greeting' : 'normalize_stt',
    )
    .addEdge('greeting', END)
    .addConditionalEdges('normalize_stt', (state: CallAgentGraphState) =>
      state.fastDecision ? 'fast_transition' : 'llm_agent',
    )
    .addEdge('fast_transition', END)
    .addEdge('llm_agent', 'enforce_state_machine')
    .addEdge('enforce_state_machine', END);

  return graph.compile();
}
