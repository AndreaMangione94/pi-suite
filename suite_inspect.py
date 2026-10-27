"""Optional Inspect adapter: scores an imported answer, never generates an answer.

CLI: .venv-inspect/Scripts/python.exe suite_inspect.py input.json output.json
input.json contains {run: <saved run>, trial: <frozen trial>}.
Only the exact bundled math/extraction cases are supported by this initial adapter.
"""
import argparse
import copy
import json
import math
import re
import shutil
import tempfile
from decimal import Decimal, InvalidOperation
from importlib.metadata import version
from pathlib import Path
from suite_benchmarks import digest, measurements

ROOT = Path(__file__).resolve().parent
SUPPORTED = ('math-001', 'extract-001')
SCORER_VERSION = 'pi-imported-v1'
CASE_FIELDS = ('key','title','family','prompt','context','setup','criteria','sourceNotes','sourceIds')


def supported(case):
    catalog=json.loads((ROOT/'benchmark-catalog.json').read_text(encoding='utf-8'))
    known=next((c for c in catalog['cases'] if c['key']==case.get('key') and c['key'] in SUPPORTED),None)
    if known is None:return False
    return case.get('version')==digest({key:known[key] for key in CASE_FIELDS}) and all(case.get(k)==known[k] for k in CASE_FIELDS)


def check_answer(case, answer):
    """Explicit narrow checks; an unparseable answer is not a measured factual error."""
    expected=json.loads(case['criteria'])['expected']
    correctness=None
    if case['key']=='math-001':
        constraint=bool(re.fullmatch(r'-?\d+',answer.strip()))
        try:
            number=Decimal(answer.strip())
            if number.is_finite():correctness=int(number==Decimal(expected))
        except InvalidOperation:pass
        explanation='Valore numerico dell’intera risposta uguale a 25; formato richiesto: solo numero intero.'
    else:
        def unique(pairs):
            result={}
            for key,value in pairs:
                if key in result:raise ValueError('Chiave JSON duplicata')
                result[key]=value
            return result
        try:
            value=json.loads(answer,object_pairs_hook=unique,parse_constant=lambda x:(_ for _ in ()).throw(ValueError(x)))
            constraint=isinstance(value,dict) and set(value)==set(expected) and all(isinstance(v,str) for v in value.values())
            if isinstance(value,dict):correctness=int(all(value.get(k)==v for k,v in expected.items()))
        except (ValueError,TypeError):constraint=False
        explanation='JSON senza testo esterno e chiavi esatte persona/scadenza; valori confrontati con la fixture riservata.'
    values={'constraints':int(constraint),'task_success':int(constraint and correctness==1)}
    if correctness is not None:values['correctness']=correctness
    return values,explanation


def evaluate_import(bundle, output_dir):
    # Import only in the optional environment; the client does not depend on Inspect.
    from inspect_ai import Task, eval as inspect_eval
    from inspect_ai.dataset import Sample
    from inspect_ai.model import ModelOutput, ChatMessageAssistant
    from inspect_ai.solver import solver
    from inspect_ai.scorer import scorer, Score, mean
    run,trial=bundle['run'],bundle['trial']
    case=trial['case']
    if not supported(case):raise ValueError('Scorer disponibile solo per le versioni originali di math-001 ed extract-001.')
    if run['trialId']!=trial['id'] or run['caseVersion']!=case['version']:
        raise ValueError('Risposta e prova non corrispondono.')
    if run['architectureId'] not in [a['id'] for a in trial['architectures']]:
        raise ValueError('Architettura non prevista nella prova.')

    @solver
    def imported_answer():
        async def solve(state, generate):
            # Deliberately never call generate: no model inference occurs here.
            state.output=ModelOutput.from_content(model='external-response',content=run['answer'])
            state.messages.append(ChatMessageAssistant(content=run['answer']))
            return state
        return solve

    @scorer(metrics={'*':[mean()]})
    def local_checks():
        async def score(state,target):
            values,explanation=check_answer(case,state.output.completion)
            return Score(value=values,answer=state.output.completion,explanation=explanation,
                         metadata={'scorerVersion':SCORER_VERSION,'inputProvenance':'user-upload','caseVersion':case['version']})
        return score

    task=Task(name='pi_imported_response',dataset=[Sample(id=run['id'],input=case['prompt']+'\n'+case['context'],
        target=case['criteria'],metadata={'architecture':run['architecture'],'trialId':trial['id'],'sourceRunId':run['id']})],
        solver=imported_answer(),scorer=local_checks())
    # Inspect's recorder uses long generated filenames that exceed MAX_PATH in
    # deep Windows workspaces. Record under a short local staging directory and
    # persist with a bounded filename in the evaluation's own directory.
    staging=(ROOT/'.inspect-work').resolve();staging.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='s-',dir=staging) as work:
        assert Path(work).resolve().is_relative_to(staging)
        logs=inspect_eval(task,model='mockllm/model',log_dir=work,display='none')
        log=logs[0]
        if log.status!='success' or not log.samples or not log.samples[0].scores:
            raise ValueError('Inspect non ha completato lo scoring: '+str(log.error))
        output_dir=Path(output_dir).resolve();output_dir.mkdir(parents=True,exist_ok=True)
        log_path=output_dir/('s-'+str(log.eval.eval_id)[:12]+'.eval')
        shutil.copyfile(log.location,log_path)
    score=next(iter(log.samples[0].scores.values()))
    result=copy.deepcopy(run)
    for key in ('id','savedAt'):result.pop(key,None)
    result['sourceRunId']=run['id']
    result['label']=run['label']+' · Inspect'
    result['evaluator']='Inspect AI '+version('inspect_ai')+' / '+SCORER_VERSION
    result['outcome']='passed' if score.value['task_success']==1 else 'failed'
    result['dimensions']=measurements(run['dimensions'])
    for key in ('task_success','correctness','constraints'):
        value=score.value.get(key)
        if value is None or not math.isfinite(value):
            result['dimensions'][key]={'status':'unavailable','value':None,'origin':'runner','note':'Risposta non interpretabile dal controllo deterministico; vedere il fallimento di formato.'}
        else:
            result['dimensions'][key]={'status':'measured','value':value,'unit':'0/1','origin':'runner',
                'measure':{'task_success':'Tutti i criteri obbligatori soddisfatti','correctness':'Valori della risposta conformi alla fixture','constraints':'Formato di risposta conforme'}[key],
                'method':SCORER_VERSION+' / '+case['key'], 'evidence':'Risposta caricata + rubrica della prova; Inspect '+log_path.name,
                'note':score.explanation}
    result['dimensions']=measurements(result['dimensions'])
    result['evaluation']={'engine':'Inspect AI','version':version('inspect_ai'),'scorer':SCORER_VERSION,
        'log':str(log_path),'sourceRunId':run['id'],'modelCalls':0,
        'note':'mockllm/model è un segnaposto tecnico del runner, non l’architettura testata. Durata e usage del runner non sono prestazioni dell’architettura.'}
    result['provenance']='Risposta caricata dall’utente; tre dimensioni valutate da Inspect con controlli deterministici. Le altre mantengono la provenienza dichiarata nel report originale.'
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input');parser.add_argument('output')
    args=parser.parse_args()
    output=Path(args.output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
    result=evaluate_import(json.loads(Path(args.input).read_text(encoding='utf-8')),output.parent/'inspect-logs')
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
