/**
 * Syncade Parser
 *
 * Parses Emerson Syncade MES XML format to ISA-88 canonical model.
 * This parser reverses the logic from syncade-generator.ts.
 *
 * Expected XML structure:
 * <SyncadeRecipe xmlns="http://www.emerson.com/syncade/recipe">
 *   <RecipeDefinition>
 *     <Header>...</Header>
 *     <ProcessSegments>
 *       <ProcessSegment>
 *         <ProcessOperations>
 *           <ProcessOperation>
 *             <ProcessActions>
 *               <ProcessAction>...</ProcessAction>
 *             </ProcessActions>
 *           </ProcessOperation>
 *         </ProcessOperations>
 *       </ProcessSegment>
 *     </ProcessSegments>
 *     <BillOfMaterials>...</BillOfMaterials>
 *   </RecipeDefinition>
 *   <WorkflowDefinition>...</WorkflowDefinition>
 *   <EBRTemplate>...</EBRTemplate>
 * </SyncadeRecipe>
 */

import {
  Procedure,
  UnitProcedure,
  Operation,
  Phase,
  Parameter,
  Material,
  Signature,
  SignatureType,
  DataType,
} from '../../models/isa88-canonical';
import { BaseParser, XmlElement } from './base-parser';
import { MESSystemId, ParserOptions, ParserResult } from './types';

export class SyncadeParser extends BaseParser {
  readonly id: MESSystemId = 'syncade';
  readonly name = 'Emerson Syncade';
  readonly description = 'Emerson Syncade Manufacturing Execution System XML Parser';
  readonly vendor = 'Emerson';
  readonly rootElement = 'SyncadeRecipe';
  readonly namespace = 'http://www.emerson.com/syncade/recipe';
  readonly supportedVersions = ['5.0', '5.1', '5.2', '6.0'];

  parse(xml: string, options?: ParserOptions): ParserResult {
    const opts = { ...this.getDefaultOptions(), ...options };
    const warnings: string[] = [];
    const unmappedData: Record<string, unknown> = {};

    const doc = this.parseXmlDocument(xml);
    const root = doc.documentElement;

    if (!root || (root.localName !== 'SyncadeRecipe' && root.nodeName !== 'SyncadeRecipe')) {
      throw new Error('Invalid Syncade XML: Root element must be <SyncadeRecipe>');
    }

    // Parse recipe definition
    const recipeDefElement = this.getFirstElement(root, 'RecipeDefinition');
    if (!recipeDefElement) {
      throw new Error('Invalid Syncade XML: Missing <RecipeDefinition> element');
    }

    // Parse header
    const headerElement = this.getFirstElement(recipeDefElement, 'Header');
    const procedure = this.parseHeader(headerElement, warnings);

    // Parse process segments (maps to unit procedures)
    const processSegmentsElement = this.getFirstElement(recipeDefElement, 'ProcessSegments');
    if (processSegmentsElement) {
      procedure.unitProcedures = this.parseProcessSegments(processSegmentsElement, warnings);
    } else {
      warnings.push('No ProcessSegments element found');
    }

    // Parse bill of materials
    const bomElement = this.getFirstElement(recipeDefElement, 'BillOfMaterials');
    if (bomElement) {
      procedure.formula = { materials: this.parseBillOfMaterials(bomElement), parameters: [] };
    }

    // Parse workflow definition (preserve as unmapped if option enabled)
    if (opts.preserveUnmappedData) {
      const workflowElement = this.getFirstElement(root, 'WorkflowDefinition');
      if (workflowElement) {
        unmappedData.workflowDefinition = this.parseWorkflowDefinition(workflowElement);
      }

      const ebrElement = this.getFirstElement(root, 'EBRTemplate');
      if (ebrElement) {
        unmappedData.ebrTemplate = this.parseEBRTemplate(ebrElement);
      }
    }

    const version = this.detectVersion(xml) || this.getAttribute(root, 'version');
    const result = this.createResult(procedure, warnings, opts.preserveUnmappedData ? unmappedData : undefined);

    if (version) {
      result.sourceVersion = version;
    }

    return result;
  }

  private parseHeader(element: XmlElement | null, warnings: string[]): Procedure {
    if (!element) {
      warnings.push('No Header element found, using defaults');
      return this.createBaseProcedure('', 'Unnamed Recipe');
    }

    const id = this.getChildTextContent(element, 'RecipeID');
    const name = this.getChildTextContent(element, 'RecipeName');
    const version = this.getChildTextContent(element, 'Version') || '1.0';
    const statusStr = this.getChildTextContent(element, 'Status');
    const productCode = this.getChildTextContent(element, 'ProductCode');
    const productName = this.getChildTextContent(element, 'ProductName');
    const description = this.getChildTextContent(element, 'Description');
    const createdDate = this.getChildTextContent(element, 'CreatedDate') || new Date().toISOString();
    const modifiedDate = this.getChildTextContent(element, 'ModifiedDate') || createdDate;
    const author = this.getChildTextContent(element, 'CreatedBy');

    const procedure = this.createBaseProcedure(id, name, version);

    procedure.header.status = this.mapStatus(statusStr);
    procedure.header.createdDate = createdDate;
    procedure.header.modifiedDate = modifiedDate;

    if (productCode) procedure.header.productCode = productCode;
    if (productName) procedure.header.productName = productName;
    if (description) procedure.header.description = description;
    if (author) procedure.header.author = author;

    return procedure;
  }

  private parseProcessSegments(element: XmlElement, warnings: string[]): UnitProcedure[] {
    const unitProcedures: UnitProcedure[] = [];
    const segmentElements = this.getElements(element, 'ProcessSegment');

    segmentElements.forEach((segEl, idx) => {
      const id = this.getAttribute(segEl, 'id') || this.getChildTextContent(segEl, 'ID');
      const name = this.getChildTextContent(segEl, 'Name');
      const sequence = this.parseInt(this.getFirstElement(segEl, 'Sequence'), idx + 1);
      const description = this.getChildTextContent(segEl, 'Description');

      const unitProcedure = this.createUnitProcedure(id, name, sequence);
      if (description) unitProcedure.description = description;

      // Parse process operations
      const operationsElement = this.getFirstElement(segEl, 'ProcessOperations');
      if (operationsElement) {
        unitProcedure.operations = this.parseProcessOperations(operationsElement, warnings);
      }

      unitProcedures.push(unitProcedure);
    });

    return unitProcedures;
  }

  private parseProcessOperations(element: XmlElement, warnings: string[]): Operation[] {
    const operations: Operation[] = [];
    const opElements = this.getElements(element, 'ProcessOperation');

    opElements.forEach((opEl, idx) => {
      const id = this.getAttribute(opEl, 'id') || this.getChildTextContent(opEl, 'ID');
      const name = this.getChildTextContent(opEl, 'Name');
      const sequence = this.parseInt(this.getFirstElement(opEl, 'Sequence'), idx + 1);
      const description = this.getChildTextContent(opEl, 'Description');

      const operation = this.createOperation(id, name, sequence);
      if (description) operation.description = description;

      // Parse signatures at operation level
      const sigReqElement = this.getFirstElement(opEl, 'SignatureRequirements');
      if (sigReqElement) {
        operation.signatures = this.parseSignatureRequirements(sigReqElement);
      }

      // Parse process actions (maps to phases)
      const actionsElement = this.getFirstElement(opEl, 'ProcessActions');
      if (actionsElement) {
        operation.phases = this.parseProcessActions(actionsElement, warnings);
      }

      operations.push(operation);
    });

    return operations;
  }

  private parseProcessActions(element: XmlElement, warnings: string[]): Phase[] {
    const phases: Phase[] = [];
    const actionElements = this.getElements(element, 'ProcessAction');

    actionElements.forEach((actionEl, idx) => {
      const id = this.getAttribute(actionEl, 'id') || this.getChildTextContent(actionEl, 'ID');
      const name = this.getChildTextContent(actionEl, 'Name');
      const sequence = this.parseInt(this.getFirstElement(actionEl, 'Sequence'), idx + 1);
      const typeStr = this.getChildTextContent(actionEl, 'ActionType');
      const instructions = this.getChildTextContent(actionEl, 'WorkInstruction');

      const phase = this.createPhase(id, name, sequence, this.mapPhaseType(typeStr));
      if (instructions) phase.instructions = instructions;

      // Parse parameters
      const paramsElement = this.getFirstElement(actionEl, 'ProcessParameters');
      if (paramsElement) {
        phase.parameters = this.parseProcessParameters(paramsElement);
      }

      // Parse materials
      const materialsElement = this.getFirstElement(actionEl, 'MaterialConsumption');
      if (materialsElement) {
        phase.materials = this.parseMaterialConsumption(materialsElement);
      }

      // Parse signatures
      const sigElement = this.getFirstElement(actionEl, 'ESignatures');
      if (sigElement) {
        phase.signatures = this.parseSignatureRequirements(sigElement);
      }

      phases.push(phase);
    });

    return phases;
  }

  private parseProcessParameters(element: XmlElement): Parameter[] {
    const parameters: Parameter[] = [];
    const paramElements = this.getElements(element, 'Parameter');

    paramElements.forEach(paramEl => {
      const name = this.getAttribute(paramEl, 'name');
      const dataTypeStr = this.getAttribute(paramEl, 'dataType');
      const value = this.getChildTextContent(paramEl, 'TargetValue');
      const unit = this.getChildTextContent(paramEl, 'UOM');
      const min = this.getChildTextContent(paramEl, 'LowerLimit');
      const max = this.getChildTextContent(paramEl, 'UpperLimit');

      const param = this.createParameter(name, name, this.mapDataType(dataTypeStr));

      if (value) param.value = value;
      if (unit) param.unit = unit;
      if (min) param.minimum = parseFloat(min);
      if (max) param.maximum = parseFloat(max);

      parameters.push(param);
    });

    return parameters;
  }

  private parseMaterialConsumption(element: XmlElement): Material[] {
    const materials: Material[] = [];
    const materialElements = this.getElements(element, 'Material');

    materialElements.forEach(matEl => {
      const code = this.getAttribute(matEl, 'code');
      const quantity = this.parseNumber(this.getFirstElement(matEl, 'Quantity'));
      const unit = this.getChildTextContent(matEl, 'UOM');

      const material = this.createMaterial(code, code, code, quantity, unit);
      materials.push(material);
    });

    return materials;
  }

  private parseSignatureRequirements(element: XmlElement): Signature[] {
    const signatures: Signature[] = [];
    const sigElements = this.getElements(element, 'SignatureRequirement');

    sigElements.forEach(sigEl => {
      const typeStr = this.getChildTextContent(sigEl, 'Type');
      const role = this.getChildTextContent(sigEl, 'Role');
      const sequence = this.parseInt(this.getFirstElement(sigEl, 'Sequence'), 1);
      const required = this.parseBoolean(this.getFirstElement(sigEl, 'Required'), true);
      const meaning = this.getChildTextContent(sigEl, 'Meaning');

      const signature = this.createSignature(
        `sig-${sequence}`,
        this.mapSignatureType(typeStr),
        role,
        sequence
      );
      signature.required = required;
      if (meaning) signature.meaning = meaning;

      signatures.push(signature);
    });

    return signatures;
  }

  private parseBillOfMaterials(element: XmlElement): Material[] {
    const materials: Material[] = [];
    const itemElements = this.getElements(element, 'MaterialItem');

    itemElements.forEach(itemEl => {
      const code = this.getChildTextContent(itemEl, 'MaterialCode');
      const name = this.getChildTextContent(itemEl, 'MaterialName');
      const quantity = this.parseNumber(this.getFirstElement(itemEl, 'Quantity'));
      const unit = this.getChildTextContent(itemEl, 'UOM');
      const typeStr = this.getChildTextContent(itemEl, 'MaterialType');
      const scalable = this.parseBoolean(this.getFirstElement(itemEl, 'Scalable'), true);

      const material = this.createMaterial(code, code, name, quantity, unit);
      material.type = this.mapMaterialType(typeStr);
      material.scalable = scalable;

      materials.push(material);
    });

    return materials;
  }

  private parseWorkflowDefinition(element: XmlElement): Record<string, unknown> {
    return {
      workflowId: this.getChildTextContent(element, 'WorkflowID'),
      workflowName: this.getChildTextContent(element, 'WorkflowName'),
      states: this.getElements(this.getFirstElement(element, 'States')!, 'State')
        .map(s => ({ id: this.getAttribute(s, 'id'), name: this.getTextContent(s) })),
    };
  }

  private parseEBRTemplate(element: XmlElement): Record<string, unknown> {
    return {
      templateId: this.getChildTextContent(element, 'TemplateID'),
      templateName: this.getChildTextContent(element, 'TemplateName'),
      templateVersion: this.getChildTextContent(element, 'TemplateVersion'),
    };
  }
}

// Export singleton instance
export const syncadeParser = new SyncadeParser();
