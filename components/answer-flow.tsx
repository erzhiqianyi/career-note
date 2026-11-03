'use client';
import type { AnswerFlow } from '@/lib/answer-flow';
import { Ja } from './japanese-text';

export function AnswerFlowView({ flow, onQuestion }: { flow: AnswerFlow; onQuestion: (id: string) => void }) {
  const questions = (items: AnswerFlow['followUps']) => <ul>{items.map(item => <li key={item.id}>
    {item.questionId ? <button className="text-button" onClick={() => onQuestion(item.questionId!)}><Ja text={item.question} /></button> : <Ja text={item.question} />}
  </li>)}</ul>;
  return <section aria-label="回答の流れ" className="answer-flow">
    <h3>回答の流れ</h3>
    <ol>{flow.nodes.map(node => {
      const related = flow.followUps.filter(item => item.nodeId === node.id);
      const hasDetails = !!(node.detail || node.cautions || related.length);
      return <li key={node.id}>
        {hasDetails ? <details><summary><Ja text={node.title} /></summary>
          {node.detail && <p className="prewrap"><Ja text={node.detail} /></p>}
          {node.cautions && <div><b>表現の注意点</b><p className="prewrap"><Ja text={node.cautions} /></p></div>}
          {!!related.length && <div><b>関連する追加質問</b>{questions(related)}</div>}
        </details> : <b><Ja text={node.title} /></b>}
        {node.cue && <p className="small"><Ja text={node.cue} /></p>}
      </li>;
    })}</ol>
    {flow.followUps.some(item => !item.nodeId) && <details><summary>関連する追加質問</summary>{questions(flow.followUps.filter(item => !item.nodeId))}</details>}
  </section>;
}
