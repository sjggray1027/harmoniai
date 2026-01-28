/**
 * PharmaSuite Parser
 *
 * Parses Rockwell Automation PharmaSuite MES XML format to ISA-88 canonical model.
 * This parser reverses the logic from pharmasuite-generator.ts.
 *
 * Supports two formats:
 * 1. B2MML format (ISA-95 compliant):
 *    <ProductDefinition xmlns="http://www.mesa.org/xml/B2MML">...</ProductDefinition>
 *
 * 2. Native PharmaSuite format:
 *    <PharmaSuiteRecipe xmlns="http://www.rockwell.com/pharmasuite/recipe">...</PharmaSuiteRecipe>
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

export class PharmaSuiteParser extends BaseParser {
  readonly id: MESSystemId = 'pharmasuite';
  readonly name = 'Rockwell PharmaSuite';
  readonly description = 'Rockwell Automation PharmaSuite MES (FactoryTalk ProductionCentre) XML Parser';
  readonly vendor = 'Rockwell Automation';
  readonly rootElement = 'ProductDefinition'; // Primary B2MML format
  readonly namespace = 'http://www.mesa.org/xml/B2MML';
  readonly supportedVersions = ['6.0', '6.1', '7.0'];

  private readonly nativeRootElement = 'PharmaSuiteRecipe';
  private readonly nativeNamespace = 'http://www.rockwell.com/pharmasuite/recipe';

  canParse(xml: string): boolean {
    try {
      const doc = this.parseXmlDocument(xml);
      const root = doc.documentElement;
      if (!root) return false;

      const rootName = root.localName || root.nodeName;
      const xmlns = root.getAttribute('xmlns') || '';

      // Check for B2MML format
      if (rootName === 'ProductDefinition' && xmlns.includes('B2MML')) {
        return true;
      }

      // Check for native format
      if (rootName === 'PharmaSuiteRecipe' && xmlns.includes('pharmasuite')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  parse(xml: string, options?: ParserOptions): ParserResult {
    const opts = { ...this.getDefaultOptions(), ...options };
    const doc = this.parseXmlDocument(xml);
    const root = doc.documentElement;

    if (!root) {
      throw new Error('Invalid PharmaSuite XML: No root element found');
    }

    const rootName = root.localName || root.nodeName;

    // Determine format and parse accordingly
    if (rootName === 'ProductDefinition') {
      return this.parseB2MMLFormat(root, opts);
    } else if (rootName === 'PharmaSuiteRecipe') {
      return this.parseNativeFormat(root, opts);
    }

    throw new Error(`Invalid PharmaSuite XML: Unexpected root element <${rootName}>`);
  }

  private parseB2MMLFormat(root: XmlElement, options: ParserOptions): ParserResult {
    const warnings: string[] = [];
    const unmappedData: Record<string, unknown> = {};

    // Parse basic info from ProductDefinition
    const id = this.getChildTextContent(root, 'ID');
    const description = this.getChildTextContent(root, 'Description');
    const version = this.getChildTextContent(root, 'Version') || '1.0';
    const publishedDate = this.getChildTextContent(root, 'PublishedDate');

    const procedure = this.createBaseProcedure(id, description, version);
    if (publishedDate) {
      procedure.header.modifiedDate = publishedDate;
    }

    // Parse ProductSegment hierarchy - get direct children only to avoid nested duplicates
    const productSegmentElements = this.getDirectChildElements(root, 'ProductSegment');
    procedure.unitProcedures = this.parseProductSegments(productSegmentElements, warnings);

    // Parse BillOfMaterial
    const bomElement = this.getFirstElement(root, 'BillOfMaterial');
    if (bomElement) {
      procedure.formula = { materials: this.parseBillOfMaterial(bomElement), parameters: [] };
    }

    // Parse ProductionRule (preserve as unmapped)
    if (options.preserveUnmappedData) {
      const ruleElement = this.getFirstElement(root, 'ProductionRule');
      if (ruleElement) {
        unmappedData.productionRule = {
          id: this.getChildTextContent(ruleElement, 'ID'),
          description: this.getChildTextContent(ruleElement, 'Description'),
          ruleLogic: this.getChildTextContent(ruleElement, 'RuleLogic'),
        };
      }
    }

    const result = this.createResult(procedure, warnings, options.preserveUnmappedData ? unmappedData : undefined);
    result.sourceVersion = version;
    return result;
  }

  private parseProductSegments(elements: XmlElement[], warnings: string[]): UnitProcedure[] {
    const unitProcedures: UnitProcedure[] = [];

    // First level ProductSegments are unit procedures
    elements.forEach((segEl, idx) => {
      const id = this.getChildTextContent(segEl, 'ID');
      const description = this.getChildTextContent(segEl, 'Description');

      const unitProcedure = this.createUnitProcedure(id, description, idx + 1);

      // Parse OperationsSegment elements as operations
      const opsSegments = this.getElements(segEl, 'OperationsSegment');
      unitProcedure.operations = this.parseOperationsSegments(opsSegments, warnings);

      // Parse parameters at segment level
      const paramElement = this.getFirstElement(segEl, 'Parameter');
      if (paramElement) {
        unitProcedure.parameters = this.parseParameterSpecifications(paramElement);
      }

      // Nested ProductSegments also become operations if no OperationsSegment
      if (unitProcedure.operations.length === 0) {
        const nestedSegments = this.getDirectChildElements(segEl, 'ProductSegment');
        if (nestedSegments.length > 0) {
          unitProcedure.operations = nestedSegments.map((nested, opIdx) => {
            const opId = this.getChildTextContent(nested, 'ID');
            const opDesc = this.getChildTextContent(nested, 'Description');
            const operation = this.createOperation(opId, opDesc, opIdx + 1);

            // Parse nested OperationsSegments
            const innerOps = this.getElements(nested, 'OperationsSegment');
            innerOps.forEach((innerOp, phIdx) => {
              const phases = this.parseOperationsSegmentToPhases(innerOp, phIdx, warnings);
              operation.phases.push(...phases);
            });

            return operation;
          });
        }
      }

      unitProcedures.push(unitProcedure);
    });

    return unitProcedures;
  }

  private parseOperationsSegments(elements: XmlElement[], warnings: string[]): Operation[] {
    return elements.map((opSegEl, idx) => {
      const id = this.getChildTextContent(opSegEl, 'ID');
      const description = this.getChildTextContent(opSegEl, 'Description');

      const operation = this.createOperation(id, description, idx + 1);

      // Parse WorkMaster elements as phases
      const workMasters = this.getElements(opSegEl, 'WorkMaster');
      operation.phases = this.parseWorkMasters(workMasters, warnings);

      // Parse PersonnelSpecification for signatures
      const personnelSpec = this.getFirstElement(opSegEl, 'PersonnelSpecification');
      if (personnelSpec) {
        operation.signatures = this.parsePersonnelSpecification(personnelSpec);
      }

      return operation;
    });
  }

  private parseOperationsSegmentToPhases(element: XmlElement, baseIdx: number, warnings: string[]): Phase[] {
    const workMasters = this.getElements(element, 'WorkMaster');
    return this.parseWorkMasters(workMasters, warnings);
  }

  private parseWorkMasters(elements: XmlElement[], warnings: string[]): Phase[] {
    return elements.map((wmEl, idx) => {
      const id = this.getChildTextContent(wmEl, 'ID');
      const description = this.getChildTextContent(wmEl, 'Description');
      const workType = this.getChildTextContent(wmEl, 'WorkType');

      const phase = this.createPhase(id, description, idx + 1, this.mapPhaseType(workType));

      // Parse instruction from WorkMasterProperty
      const propElements = this.getElements(wmEl, 'WorkMasterProperty');
      propElements.forEach(prop => {
        const propId = this.getChildTextContent(prop, 'ID');
        if (propId === 'INSTRUCTION') {
          const valueEl = this.getFirstElement(prop, 'Value');
          if (valueEl) {
            phase.instructions = this.getChildTextContent(valueEl, 'ValueString');
          }
        }
      });

      // Parse parameters
      const paramElement = this.getFirstElement(wmEl, 'Parameter');
      if (paramElement) {
        phase.parameters = this.parseParameterSpecifications(paramElement);
      }

      // Parse materials
      const matSpec = this.getFirstElement(wmEl, 'MaterialSpecification');
      if (matSpec) {
        phase.materials = this.parseMaterialSpecification(matSpec);
      }

      // Parse signatures
      const personnelSpec = this.getFirstElement(wmEl, 'PersonnelSpecification');
      if (personnelSpec) {
        phase.signatures = this.parsePersonnelSpecification(personnelSpec);
      }

      return phase;
    });
  }

  private parseParameterSpecifications(element: XmlElement): Parameter[] {
    const parameters: Parameter[] = [];
    const specElements = this.getElements(element, 'ParameterSpecification');

    specElements.forEach(specEl => {
      const id = this.getChildTextContent(specEl, 'ID');
      const description = this.getChildTextContent(specEl, 'Description');
      const valueEl = this.getFirstElement(specEl, 'Value');

      let dataType = DataType.STRING;
      let value: string | number | undefined;
      let min: number | undefined;
      let max: number | undefined;
      let unit: string | undefined;

      if (valueEl) {
        const dtStr = this.getChildTextContent(valueEl, 'DataType');
        dataType = this.mapDataType(dtStr);
        value = this.getChildTextContent(valueEl, 'ValueString') || undefined;
        const minStr = this.getChildTextContent(valueEl, 'MinValue');
        const maxStr = this.getChildTextContent(valueEl, 'MaxValue');
        if (minStr) min = parseFloat(minStr);
        if (maxStr) max = parseFloat(maxStr);
        unit = this.getChildTextContent(valueEl, 'UnitOfMeasure') || undefined;
      }

      const param = this.createParameter(id, description, dataType);
      if (value !== undefined) param.value = value;
      if (min !== undefined) param.minimum = min;
      if (max !== undefined) param.maximum = max;
      if (unit) param.unit = unit;

      parameters.push(param);
    });

    return parameters;
  }

  private parseMaterialSpecification(element: XmlElement): Material[] {
    const materials: Material[] = [];
    const propElements = this.getElements(element, 'MaterialSpecificationProperty');

    propElements.forEach(propEl => {
      const id = this.getChildTextContent(propEl, 'ID');
      const description = this.getChildTextContent(propEl, 'Description');
      const code = this.getChildTextContent(propEl, 'MaterialDefinitionID');
      const quantityEl = this.getFirstElement(propEl, 'Quantity');

      let quantity = 0;
      let unit = 'EA';
      if (quantityEl) {
        quantity = this.parseNumber(this.getFirstElement(quantityEl, 'Value'));
        unit = this.getChildTextContent(quantityEl, 'UnitOfMeasure') || 'EA';
      }

      const material = this.createMaterial(id, code, description, quantity, unit);
      materials.push(material);
    });

    return materials;
  }

  private parsePersonnelSpecification(element: XmlElement): Signature[] {
    const signatures: Signature[] = [];
    const propElements = this.getElements(element, 'PersonnelSpecificationProperty');

    propElements.forEach((propEl, idx) => {
      const id = this.getChildTextContent(propEl, 'ID');
      const description = this.getChildTextContent(propEl, 'Description');
      const valueEl = this.getFirstElement(propEl, 'Value');
      const role = valueEl ? this.getChildTextContent(valueEl, 'ValueString') : '';

      // Parse signature type from description
      const sigType = this.parseSignatureTypeFromDescription(description);

      const signature = this.createSignature(id, sigType, role || description, idx + 1);
      signatures.push(signature);
    });

    return signatures;
  }

  private parseSignatureTypeFromDescription(description: string): SignatureType {
    const lower = description.toLowerCase();
    if (lower.includes('perform')) return SignatureType.PERFORM;
    if (lower.includes('verify') || lower.includes('verified')) return SignatureType.VERIFY;
    if (lower.includes('approve') || lower.includes('approved')) return SignatureType.APPROVE;
    if (lower.includes('review') || lower.includes('reviewed')) return SignatureType.REVIEW;
    if (lower.includes('witness')) return SignatureType.WITNESS;
    return SignatureType.PERFORM;
  }

  private parseBillOfMaterial(element: XmlElement): Material[] {
    const materials: Material[] = [];
    const itemElements = this.getElements(element, 'MaterialBillItem');

    itemElements.forEach(itemEl => {
      const id = this.getChildTextContent(itemEl, 'ID');
      const code = this.getChildTextContent(itemEl, 'MaterialDefinitionID');
      const description = this.getChildTextContent(itemEl, 'Description');
      const quantityEl = this.getFirstElement(itemEl, 'Quantity');
      const materialUse = this.getChildTextContent(itemEl, 'MaterialUse');

      let quantity = 0;
      let unit = 'EA';
      if (quantityEl) {
        quantity = this.parseNumber(this.getFirstElement(quantityEl, 'Value'));
        unit = this.getChildTextContent(quantityEl, 'UnitOfMeasure') || 'EA';
      }

      const material = this.createMaterial(id, code, description, quantity, unit);
      material.type = this.mapMaterialType(materialUse);
      materials.push(material);
    });

    return materials;
  }

  private parseNativeFormat(root: XmlElement, options: ParserOptions): ParserResult {
    const warnings: string[] = [];
    const unmappedData: Record<string, unknown> = {};

    // Parse header
    const headerElement = this.getFirstElement(root, 'RecipeHeader');
    const procedure = this.parseNativeHeader(headerElement, warnings);

    // Parse recipe body
    const bodyElement = this.getFirstElement(root, 'RecipeBody');
    if (bodyElement) {
      procedure.unitProcedures = this.parseNativeRecipeBody(bodyElement, warnings);
    }

    const result = this.createResult(procedure, warnings, options.preserveUnmappedData ? unmappedData : undefined);
    return result;
  }

  private parseNativeHeader(element: XmlElement | null, warnings: string[]): Procedure {
    if (!element) {
      warnings.push('No RecipeHeader element found');
      return this.createBaseProcedure('', 'Unnamed Recipe');
    }

    const id = this.getChildTextContent(element, 'RecipeID');
    const name = this.getChildTextContent(element, 'RecipeName');
    const version = this.getChildTextContent(element, 'Version') || '1.0';
    const statusStr = this.getChildTextContent(element, 'Status');
    const createdDate = this.getChildTextContent(element, 'CreatedDate');
    const modifiedDate = this.getChildTextContent(element, 'ModifiedDate');

    const procedure = this.createBaseProcedure(id, name, version);
    procedure.header.status = this.mapStatus(statusStr);
    if (createdDate) procedure.header.createdDate = createdDate;
    if (modifiedDate) procedure.header.modifiedDate = modifiedDate;

    return procedure;
  }

  private parseNativeRecipeBody(element: XmlElement, warnings: string[]): UnitProcedure[] {
    const unitProcedures: UnitProcedure[] = [];
    const segmentElements = this.getElements(element, 'ProcessSegment');

    segmentElements.forEach(segEl => {
      const id = this.getAttribute(segEl, 'id');
      const sequence = parseInt(this.getAttribute(segEl, 'sequence'), 10) || unitProcedures.length + 1;
      const name = this.getChildTextContent(segEl, 'Name');
      const description = this.getChildTextContent(segEl, 'Description');

      const unitProcedure = this.createUnitProcedure(id, name, sequence);
      if (description) unitProcedure.description = description;

      // Parse operations
      const operationsEl = this.getFirstElement(segEl, 'Operations');
      if (operationsEl) {
        const opElements = this.getElements(operationsEl, 'Operation');
        unitProcedure.operations = opElements.map((opEl, opIdx) => {
          const opId = this.getAttribute(opEl, 'id');
          const opSequence = parseInt(this.getAttribute(opEl, 'sequence'), 10) || opIdx + 1;
          const opName = this.getChildTextContent(opEl, 'Name');

          const operation = this.createOperation(opId, opName, opSequence);

          // Parse phases
          const phasesEl = this.getFirstElement(opEl, 'Phases');
          if (phasesEl) {
            const phaseElements = this.getElements(phasesEl, 'Phase');
            operation.phases = phaseElements.map((phEl, phIdx) => {
              const phId = this.getAttribute(phEl, 'id');
              const phSequence = parseInt(this.getAttribute(phEl, 'sequence'), 10) || phIdx + 1;
              const phName = this.getChildTextContent(phEl, 'Name');
              const phType = this.getChildTextContent(phEl, 'Type');
              const instructions = this.getChildTextContent(phEl, 'Instructions');

              const phase = this.createPhase(phId, phName, phSequence, this.mapPhaseType(phType));
              if (instructions) phase.instructions = instructions;

              return phase;
            });
          }

          return operation;
        });
      }

      unitProcedures.push(unitProcedure);
    });

    return unitProcedures;
  }
}

// Export singleton instance
export const pharmaSuiteParser = new PharmaSuiteParser();
