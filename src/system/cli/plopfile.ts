import type { NodePlopAPI } from 'plop';
import { registerHelpers, registerPartials } from './helpers.ts';
import { registerPageModuleActions } from './actions/page-module-actions.ts';
import { registerModuleFieldActions } from './actions/module-field-actions.ts';
import { registerPageActions } from './actions/page-actions.ts';
import { registerModuleActions } from './actions/module-actions.ts';
import { registerModuleCreateGenerator } from './generators/module-create.ts';
import { registerPageAddModuleGenerator } from './generators/page-add-module.ts';
import { registerPageRemoveModuleGenerator } from './generators/page-remove-module.ts';
import { registerModuleAddEditableFieldGenerator } from './generators/module-add-editable-field.ts';
import { registerModuleRemoveEditableFieldGenerator } from './generators/module-remove-editable-field.ts';
import { registerModuleAddCustomFieldGenerator } from './generators/module-add-custom-field.ts';
import { registerModuleRemoveCustomFieldGenerator } from './generators/module-remove-custom-field.ts';
import { registerPageAddGenerator } from './generators/page-add.ts';
import { registerPageRemoveGenerator } from './generators/page-remove.ts';
import { registerModuleRemoveGenerator } from './generators/module-remove.ts';

export default function plopfile(plop: NodePlopAPI) {
  registerHelpers(plop);
  registerPartials(plop);

  registerPageModuleActions(plop);
  registerModuleFieldActions(plop);
  registerPageActions(plop);
  registerModuleActions(plop);

  registerModuleCreateGenerator(plop);
  registerPageAddModuleGenerator(plop);
  registerPageRemoveModuleGenerator(plop);
  registerModuleAddEditableFieldGenerator(plop);
  registerModuleRemoveEditableFieldGenerator(plop);
  registerModuleAddCustomFieldGenerator(plop);
  registerModuleRemoveCustomFieldGenerator(plop);
  registerPageAddGenerator(plop);
  registerPageRemoveGenerator(plop);
  registerModuleRemoveGenerator(plop);
}
