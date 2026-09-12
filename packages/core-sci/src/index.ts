/**
 * sci-core — rdzeń naukowy bazy wiedzy.
 *
 * Zero UI, zero React, zero Three.js: solvery, jednostki i graf wzorów dają się
 * uruchomić w Vitest headless i w Web Workerze. Rendering jest osobno, bo model
 * nie ma prawa wiedzieć, że ktoś go rysuje.
 *
 * Droga od dokumentu do symulacji: bloki ```formula w treści → `parseFormulaBlock`
 * → `buildGraph` (kolejność obliczeń, parametry, walidacja) → `compileGraph`
 * (wykonywalny model) → `run()` (wyniki i trajektoria).
 */
export { Trajectory } from './numeric/trajectory';
export type { State, Sample, Derivative, SolveOptions, StepHook } from './numeric/trajectory';
export { rk4, euler, verlet, solve } from './numeric/solvers';
export type { SolverName, SolverOptions, Acceleration } from './numeric/solvers';
export { dopri5, IntegrationError } from './numeric/dopri5';
export { rosenbrock } from './numeric/rosenbrock';
export type { RosenbrockOptions } from './numeric/rosenbrock';
export { solveLinear } from './numeric/linsolve';
export type { AdaptiveOptions } from './numeric/dopri5';
export { evalInterpolant } from './numeric/trajectory';
export type { Interpolant } from './numeric/trajectory';
export { findEventTime, crossesZero } from './numeric/events';
export type { EventSpec, EventHit, CrossingDirection } from './numeric/events';
export { spectrum, dominantFrequency, fftInPlace } from './analysis/spectrum';
export type { Spectrum, SpectrumOptions } from './analysis/spectrum';
export { periodOf, periodFromCrossings } from './analysis/period';
export type { PeriodResult } from './analysis/period';
export { studyConvergence, richardson } from './numeric/convergence';
export type {
  ConvergenceReport, ConvergenceOptions, ConvergenceLevel, VariableError,
} from './numeric/convergence';
export { measureInvariant, describeInvariant } from './numeric/invariants';
export type { InvariantReport, InvariantOptions, InvariantTrend } from './numeric/invariants';

export { parseQuantity, toSI, sameDimension, formatIn, UnitError } from './units/quantity';
export type { ParsedQuantity } from './units/quantity';
export { CONSTANTS, constantValue } from './units/constants';
export type { PhysicalConstant } from './units/constants';

export { parseFormulaBlock, serializeFormulaBlock, symbolName, FORMULA_FENCE } from './formula/parseFormula';
// Katalog dyrektyw — ściąga w edytorze i jedno źródło prawdy o składni bloków.
export { FORMULA_DIRECTIVES, EXERCISE_DIRECTIVES, suggestDirectives } from './formula/directives';
export type { DirectiveInfo, DirectiveScope } from './formula/directives';
export type { FormulaBlock, FormulaKind, FormulaIssue, FormulaEvent } from './formula/parseFormula';
export { compileExpression, compileCondition, compileComparison, evaluateOnce } from './formula/expression';
export type { CompiledComparison } from './formula/expression';
export { RESERVED_SYMBOLS, reservedSymbol } from './formula/reservedSymbols';
export type { ReservedSymbol } from './formula/reservedSymbols';
export type { CompiledExpression, CompiledCondition } from './formula/expression';

export { buildGraph, topologicalOrder } from './graph/formulaGraph';
export type { FormulaGraph, GraphNode, GraphIssue } from './graph/formulaGraph';
export { compileGraph, defaultValues, applyOverrides } from './graph/compileGraph';
// Porównanie przebiegów — „co się zmieni, gdy zmienię ten parametr".
export { compareRuns } from './graph/porownanie';
export type { ComparisonRun, ComparisonOptions, ComparisonResult } from './graph/porownanie';
export { suggestViews } from './graph/visualization';
export { walkthrough, knownAfter } from './graph/walkthrough';

export { parseExerciseBlock, serializeExerciseBlock, EXERCISE_FENCE } from './exercise/parseExercise';
export type { ExerciseBlock, GivenRange, AnswerKind } from './exercise/parseExercise';
export { exerciseVariant, statedVariant, checkNumeric, checkSymbolic } from './exercise/solveExercise';
export type { ExerciseVariant, CheckResult, CheckVerdict } from './exercise/solveExercise';
export { buildHints } from './exercise/hints';

export { registerModel, knownModels, buildModel, modelOptionNames } from './models/registry';
export type { ModelSpec, BuiltModel } from './models/registry';
// Import dla efektu ubocznego: wpisuje wbudowane zjawiska do rejestru. Bez tego
// `buildModel('wahadlo')` odpowiadałby „nie znam", choć plik istnieje.
import './models/builtin';

export { defineModel } from './model/defineModel';
export type { ManualModelSpec } from './model/defineModel';
export { runScript, stripTypes, SCRIPT_API_TYPES } from './model/runScript';

export {
  computeRequest, handleWorkerMessage, modelFromSource, restoreResult,
} from './worker/protocol';
export type { ModelSource, ComputeRequest, ComputeResponse } from './worker/protocol';

export {
  heliocentric, heliocentricDistance, distanceFromEarth, geocentricLongitude,
  solveKepler, toJulianDate, centuriesSinceJ2000, KEPLER_J2000, BODIES, AU,
} from './astro/ephemeris';
export type { KeplerElements, BodyData, HeliocentricPosition } from './astro/ephemeris';
export type { ScriptApi, ScriptResult } from './model/runScript';

export { parseTermBlock, serializeTermBlock, TERM_FENCE } from './knowledge/glossary';
export { parseFigureBlock, parseTableBlock } from './knowledge/blocks';
export { parseCalloutBlock, CALLOUT_FENCE, CALLOUT_KINDS } from './knowledge/callout';
export { parseLawBlock, LAW_FENCE } from './knowledge/law';
export { setFigureWidth, normalizeFigureWidth } from './knowledge/figureWidth';
export type { PlotSpec, PlotPanel, PlotCurve } from './knowledge/blocks';
export type { FigureBlock, TableBlock, BlockIssue } from './knowledge/blocks';
export type { TermBlock, TermIssue } from './knowledge/glossary';
export type { CalloutBlock, CalloutIssue, CalloutKind } from './knowledge/callout';
export type { LawBlock, LawIssue } from './knowledge/law';
export {
  buildIndex, readDocument, parseFrontMatter, learningGraph,
  allExercises, exercisesFor, documentsByTag,
} from './knowledge/index';
export type {
  KnowledgeIndex, KnowledgeDocument, KnowledgeIssue, DocumentMeta, LearningEdge,
  Anchor, AnchorKind,
} from './knowledge/index';
export { search, layoutKnowledgeGraph, learningOrder, tagCounts, odmiana } from './knowledge/catalog';
export {
  parseReferences, resolveReference, splitByReferences, danglingReferences,
} from './knowledge/references';
export type { Reference, ReferenceIndex, ResolvedReference, ReferenceKind, TextPart } from './knowledge/references';
export { exportSite, pagePath } from './knowledge/exportSite';
export type { SourceDocument, SiteFile, ExportOptions } from './knowledge/exportSite';
export { planPack } from './knowledge/packSite';
export type { PdeSpec } from './formula/parseFormula';
export {
  apply, compose, det, eigen, identity, interpolate, inverse, rank,
} from './linalg/matrix';
export type { Matrix2, Vector2, EigenPair, EigenResult } from './linalg/matrix';
export {
  applyM3, composeM3, detM3, eigenM3, identityM3, interpolateM3, inverseM3,
  kernelBasis, rankM3,
} from './linalg/matrix3';
export type { Matrix3, Vector3, EigenPair3, EigenResult3 } from './linalg/matrix3';
export { alignment, pickVector, snapToEigen } from './linalg/interaction';
export { gaussSteps, gaussStepsN, gramSchmidtSteps, isOrthonormal } from './linalg/procedures';
export type { GaussStepN } from './linalg/procedures';
export type { GaussStep, GramSchmidtStep } from './linalg/procedures';
export { compileLinAlg } from './linalg/compileLinAlg';
export { compileLinAlg3 } from './linalg/compileLinAlg3';
export type { LinAlg3Model, LinAlg3Result } from './linalg/compileLinAlg3';
export type { LinAlgModel, LinAlgResult, MatrixParam, VectorParam } from './linalg/compileLinAlg';
export type { LinAlgSpec } from './formula/parseFormula';
export { latexToPython } from './validation/toPython';
export type { PythonExpression } from './validation/toPython';
export { exportScenario } from './validation/scenario';
// Cross-walidacja pól: scenariusz dla metody linii w SciPy.
export { exportPdeScenario } from './validation/pdeScenario';
export type { PdeScenario, PdeScenarioOptions } from './validation/pdeScenario';
export type { Scenario, ScenarioCheckpoint, ScenarioOptions } from './validation/scenario';
export { editableExpressions, replaceExpression } from './formula/editFormula';
export type { EditableExpression } from './formula/editFormula';
export { compileStrokes, parseStrokes, serializeStrokes } from './pen/strokes';
export { serializeInk, parseInk, inkIsEmpty } from './pen/ink';
export type { InkStroke, InkPoint } from './pen/ink';
export type { Stroke } from './pen/strokes';
export { compilePde } from './pde/grid2d';
export type { PdeModel, PdeResult, PdeFrame } from './pde/grid2d';
export { emptyProgress, recordAttempt, dueFor, qualityOf, summarize } from './progress/schedule';
export { markRead, unmarkRead, isRead, readingStats } from './progress/read';
export {
  planRevision, defaultRevisionSettings, dueCount, ACTIVITY_KINDS, DAY,
} from './progress/revision';
export type {
  ActivityKind, RevisionSettings, RevisionSource, RevisionCandidate,
  RevisionItem, RevisionPlan, ProgressWithRevision,
} from './progress/revision';
export { recordSolution, solutionsFor, pruneSolutions, SOLUTION_HISTORY_LIMIT } from './progress/solutions';
export type { Solution, SolutionMode, ProgressWithSolutions } from './progress/solutions';
export type { ProgressWithReading, ReadMark, ReadingStats } from './progress/read';
export type { Progress, ProgressItem, Quality, Attempt } from './progress/schedule';
export type { PackPlan, PackEntry } from './knowledge/packSite';
export type { SearchHit, MatchKind, GraphLayout, GraphNodePosition } from './knowledge/catalog';
export type { Hint } from './exercise/hints';
export type { WalkthroughStep } from './graph/walkthrough';
export type { ViewSpec, ViewKind } from './graph/visualization';
export type { PhenomenonModel, PhenomenonResult, ParamSchema, ObservableDef } from './graph/compileGraph';

// --- wykres interaktywny (SciPlot) ---
export { splitRelation } from './plot/relation';
export type { RelationOp, RelationParts } from './plot/relation';
export { parsePlotRow } from './plot/parseRow';
// Powierzchnie `z = f(x, y)` — jedyny sposób pokazania siodła i ekstremów.
export { sampleSurface } from './plot/surface';
export type { SurfaceGrid, SurfaceRange } from './plot/surface';
export type { PlotRowKind, ParsedPlotRow, PlotPoint } from './plot/parseRow';
export {
  createPlotDocument, parsePlotDocument, serializePlotDocument,
  addRow, removeRow, updateRow,
  DEFAULT_VIEWPORT, DEFAULT_SETTINGS, DEFAULT_SLIDER, ROW_COLORS, PLOT_FORMAT_VERSION,
} from './plot/document';
export type { PlotDocument, PlotRow, PlotSettings, Viewport, RowStyle, SliderSpec } from './plot/document';
export {
  worldToScreen, screenToWorld, unitsPerPixel, panByPixels, zoomAt, fitAspect,
  niceStep, niceTicks, minorStep,
} from './plot/viewport';
export type { Size, Point } from './plot/viewport';
export type { AngularUnit } from './formula/expression';
export { sampleFunction } from './plot/sample';
export type { Segment, SampleOptions } from './plot/sample';
export { evaluateDocument } from './plot/evaluate';
export type { EvaluatedRow, EvaluationResult } from './plot/evaluate';
export { stepSlider } from './plot/animation';
export type { SliderMode, SliderAnimation, SliderPlayback, SliderSpecLike } from './plot/animation';
export { marchImplicit } from './plot/implicit';
export type { ImplicitResult, ImplicitOptions, ImplicitWindow, FillCell } from './plot/implicit';
