/**
 * Sam język wyrażeń, bez modelu i solverów.
 *
 * Osobne wejście, bo Rysik i szkic CAD potrzebują wyłącznie tego: policzyć
 * `dlugosc * 2` w zakresie nazw. Ciągnięcie za tym całego layoutu byłoby
 * zapłatą za coś, czego nie używają.
 */
export { evalExpr, exprDeps } from './expr';
