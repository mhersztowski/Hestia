import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, InputAdornment, FormControlLabel, Checkbox } from '@mui/material';
import type { DimensionEntity, Entity, Project } from '../../cad2d/barrel';
import { applyDimensionValue, dimRefs, measuredValue } from '../../cad2d/barrel';

interface Props {
  project: Project;
  dimId: string;
  onClose: () => void;
}

/**
 * The dialog for a dimension's value. Typing in the field drives the geometry
 * live, before OK; OK then makes the dimension a driving constraint, which holds
 */
export function DimensionValueDialog({ project, dimId, onClose }: Props) {
  const dim = project.entityRegistry.get(dimId) as DimensionEntity | undefined;
  const [text, setText] = useState<string>(() => (dim ? (dim.value ?? measuredValue(dim)).toFixed(2) : ''));
  const [driving, setDriving] = useState<boolean>(() => !!dim?.driving);
  // A snapshot of the entities it refers to, to put back on Cancel.
  const origRef = useRef<Map<string, Entity>>(new Map());
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!dim) return;
    const m = new Map<string, Entity>();
    for (const id of dimRefs(dim)) { const e = project.entityRegistry.get(id); if (e) m.set(id, { ...e }); }
    origRef.current = m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimId]);

  if (!dim) return null;

  // Always read the dimension afresh — the entity is replaced by every live edit.
  const freshDim = (): DimensionEntity | undefined =>
    project.entityRegistry.get(dimId) as DimensionEntity | undefined;

  const onChange = (raw: string) => {
    setText(raw);
    const v = parseFloat(raw);
    const d = freshDim();
    if (d && isFinite(v) && v > 0) applyDimensionValue(project, d, v); // live drive
  };

  const revert = () => {
    for (const [id, e] of origRef.current) {
      project.entityRegistry.update(id, e as unknown as Record<string, unknown>);
      const cur = project.entityRegistry.get(id);
      if (cur) project.eventBus.emit('entity:updated', cur);
    }
  };

  const handleOk = () => {
    const v = parseFloat(text);
    const d = freshDim();
    if (d && isFinite(v) && v > 0) {
      applyDimensionValue(project, d, v);
      project.entityRegistry.update(dimId, { driving, value: v });
      const upd = project.entityRegistry.get(dimId);
      if (upd) project.eventBus.emit('entity:updated', upd);
    }
    onClose();
  };

  const handleCancel = () => { revert(); onClose(); };

  return (
    <Dialog
      open
      // Ignore a click on the backdrop (and the ghost click a phone sends just
      // after opening): only Cancel, OK and Escape close this, which stops the
      // flicker of opening and vanishing at once.
      onClose={(_e, reason) => { if (reason === 'backdropClick') return; handleCancel(); }}
      maxWidth="xs"
      fullWidth
      // Focus and select the field once the dialog has slid in, so a value can be typed straight over.
      TransitionProps={{ onEntered: () => { inputRef.current?.focus(); inputRef.current?.select(); } }}
    >
      <DialogTitle sx={{ fontSize: 16 }}>Dimension value</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          inputRef={inputRef}
          fullWidth
          type="number"
          label="Value"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => { if (e.key === 'Enter') handleOk(); }}
          inputProps={{ step: 'any', min: 0 }}
          InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
          sx={{ mt: 1 }}
        />
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Checkbox checked={driving} onChange={(e) => setDriving(e.target.checked)} />}
          label="Driving constraint (holds the value)"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleOk}>OK</Button>
      </DialogActions>
    </Dialog>
  );
}
