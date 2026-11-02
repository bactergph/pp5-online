import {FiChevronDown,FiHelpCircle,FiInfo} from 'react-icons/fi'
import type {WorkspaceGuidance} from '@/lib/workspace-guidance'

/** Inline disclosure: adds no overlay, navigation or extra task-selection card. */
export default function WorkspacePageGuide({guide}:{guide:WorkspaceGuidance}){
  return <details className="workspace-page-guide no-print">
    <summary><FiHelpCircle aria-hidden="true"/><span>วิธีใช้หน้านี้</span><FiChevronDown className="workspace-guide-chevron" aria-hidden="true"/></summary>
    <div className="workspace-guide-body">
      <p className="workspace-guide-purpose">{guide.purpose}</p>
      <ol>{guide.steps.map((step,index)=><li key={step}><span aria-hidden="true">{index+1}</span><p>{step}</p></li>)}</ol>
      {guide.note&&<p className="workspace-guide-note"><FiInfo aria-hidden="true"/><span>{guide.note}</span></p>}
    </div>
  </details>
}
