/**
 * MODA Parser
 *
 * Parses Lonza MODA MES XML format to ISA-88 canonical model.
 * This parser reverses the logic from moda-generator.ts.
 *
 * Expected XML structure:
 * <ModaEBRTemplate xmlns="http://www.lonza.com/moda/ebr">
 *   <TemplateHeader>...</TemplateHeader>
 *   <WorkflowDefinition>
 *     <Phases>
 *       <Phase>
 *         <Steps>
 *           <Step>
 *             <Tasks>
 *               <Task>...</Task>
 *             </Tasks>
 *           </Step>
 *         </Steps>
 *       </Phase>
 *     </Phases>
 *   </WorkflowDefinition>
 *   <FormSections>...</FormSections>
 *   <DeviationHandling>...</DeviationHandling>
 *   <CalculationsConfiguration>...</CalculationsConfiguration>
 *   <AttachmentConfiguration>...</AttachmentConfiguration>
 * </ModaEBRTemplate>
 */

import {
  Procedure,
  UnitProcedure,
  Operation,
  Phase,
  Parameter,
  Material,
  Signature,
  Equipment,
  InterfacePoint,
  SignatureType,
  DataType,
  InterfaceSystem,
} from '../../models/isa88-canonical';
import { BaseParser, XmlElement } from './base-parser';
import { MESSystemId, ParserOptions, ParserResult } from './types';

export class ModaParser extends BaseParser {
  readonly id: MESSystemId = 'moda';
  readonly name = 'Lonza MODA';
  readonly description = 'Lonza MODA Manufacturing Execution System XML Parser';
  readonly vendor = 'Lonza';
  readonly rootElement = 'ModaEBRTemplate';
  readonly namespace = 'http://www.lonza.com/moda/ebr';
  readonly supportedVersions = ['3.0', '3.5', '4.0'];

  parse(xml: string, options?: ParserOptions): ParserResult {
    const opts = { ...this.getDefaultOptions(), ...options };
    const warnings: string[] = [];
    const unmappedData: Record<string, unknown> = {};

    const doc = this.parseXmlDocument(xml);
    const root = doc.documentElement;

    if (!root || (root.localName !== 'ModaEBRTemplate' && root.nodeName !== 'ModaEBRTemplate')) {
      throw new Error('Invalid MODA XML: Root element must be <ModaEBRTemplate>');
    }

    // Parse template header
    const headerElement = this.getFirstElement(root, 'TemplateHeader');
    const procedure = this.parseTemplateHeader(headerElement, warnings);

    // Parse workflow definition
    const workflowElement = this.getFirstElement(root, 'WorkflowDefinition');
    if (workflowElement) {
      procedure.unitProcedures = this.parseWorkflowDefinition(workflowElement, warnings);
    } else {
      warnings.push('No WorkflowDefinition element found');
    }

    // Parse and preserve additional sections as unmapped data
    if (opts.preserveUnmappedData) {
      const formSectionsEl = this.getFirstElement(root, 'FormSections');
      if (formSectionsEl) {
        unmappedData.formSections = this.parseFormSections(formSectionsEl);
      }

      const deviationEl = this.getFirstElement(root, 'DeviationHandling');
      if (deviationEl) {
        unmappedData.deviationHandling = this.parseDeviationHandling(deviationEl);
      }

      const calcEl = this.getFirstElement(root, 'CalculationsConfiguration');
      if (calcEl) {
        unmappedData.calculationsConfiguration = this.parseCalculationsConfig(calcEl);
      }

      const attachEl = this.getFirstElement(root, 'AttachmentConfiguration');
      if (attachEl) {
        unmappedData.attachmentConfiguration = this.parseAttachmentConfig(attachEl);
      }
    }

    const version = this.getAttribute(root, 'version') || this.detectVersion(xml);
    const result = this.createResult(procedure, warnings, opts.preserveUnmappedData ? unmappedData : undefined);

    if (version) {
      result.sourceVersion = version;
    }

    return result;
  }

  private parseTemplateHeader(element: XmlElement | null, warnings: string[]): Procedure {
    if (!element) {
      warnings.push('No TemplateHeader element found');
      return this.createBaseProcedure('', 'Unnamed Template');
    }

    const id = this.getChildTextContent(element, 'TemplateId');
    const name = this.getChildTextContent(element, 'TemplateName');
    const version = this.getChildTextContent(element, 'Version') || '1.0';
    const statusStr = this.getChildTextContent(element, 'Status');
    const productCode = this.getChildTextContent(element, 'ProductCode');
    const productName = this.getChildTextContent(element, 'ProductName');
    const description = this.getChildTextContent(element, 'Description');
    const createdDate = this.getChildTextContent(element, 'CreatedDate') || new Date().toISOString();
    const modifiedDate = this.getChildTextContent(element, 'ModifiedDate') || createdDate;
    const author = this.getChildTextContent(element, 'Author');

    const procedure = this.createBaseProcedure(id, name, version);

    procedure.header.status = this.mapStatus(statusStr);
    procedure.header.createdDate = createdDate;
    procedure.header.modifiedDate = modifiedDate;

    if (productCode) procedure.header.productCode = productCode;
    if (productName) procedure.header.productName = productName;
    if (description) procedure.header.description = description;
    if (author) procedure.header.author = author;

    // Parse batch size if present
    const batchSizeEl = this.getFirstElement(element, 'BatchSize');
    if (batchSizeEl) {
      const nominal = this.parseNumber(this.getFirstElement(batchSizeEl, 'NominalSize'));
      const minimum = this.parseNumber(this.getFirstElement(batchSizeEl, 'MinSize'));
      const maximum = this.parseNumber(this.getFirstElement(batchSizeEl, 'MaxSize'));
      const unit = this.getChildTextContent(batchSizeEl, 'Unit');

      if (nominal > 0) {
        procedure.header.batchSize = { nominal, minimum, maximum, unit };
      }
    }

    return procedure;
  }

  private parseWorkflowDefinition(element: XmlElement, warnings: string[]): UnitProcedure[] {
    const unitProcedures: UnitProcedure[] = [];

    // MODA uses "Phase" at workflow level which maps to UnitProcedure
    const phasesElement = this.getFirstElement(element, 'Phases');
    if (!phasesElement) {
      warnings.push('No Phases element found in WorkflowDefinition');
      return unitProcedures;
    }

    const phaseElements = this.getElements(phasesElement, 'Phase');

    phaseElements.forEach(phaseEl => {
      const sequence = parseInt(this.getAttribute(phaseEl, 'sequence'), 10) || unitProcedures.length + 1;
      const id = this.getChildTextContent(phaseEl, 'PhaseId');
      const name = this.getChildTextContent(phaseEl, 'PhaseName');
      const description = this.getChildTextContent(phaseEl, 'Description');

      const unitProcedure = this.createUnitProcedure(id, name, sequence);
      if (description) unitProcedure.description = description;

      // Parse steps (map to operations)
      const stepsElement = this.getFirstElement(phaseEl, 'Steps');
      if (stepsElement) {
        unitProcedure.operations = this.parseSteps(stepsElement, warnings);
      }

      // Parse phase-level signatures
      const signoffsElement = this.getFirstElement(phaseEl, 'PhaseSignoffs');
      if (signoffsElement) {
        unitProcedure.signatures = this.parseESignatures(signoffsElement);
      }

      // Parse equipment allocation
      const equipAllocElement = this.getFirstElement(phaseEl, 'EquipmentAllocation');
      if (equipAllocElement) {
        unitProcedure.equipment = this.parseEquipmentAllocation(equipAllocElement);
      }

      unitProcedures.push(unitProcedure);
    });

    return unitProcedures;
  }

  private parseSteps(element: XmlElement, warnings: string[]): Operation[] {
    const operations: Operation[] = [];
    const stepElements = this.getElements(element, 'Step');

    stepElements.forEach(stepEl => {
      const sequence = parseInt(this.getAttribute(stepEl, 'sequence'), 10) || operations.length + 1;
      const id = this.getChildTextContent(stepEl, 'StepId');
      const name = this.getChildTextContent(stepEl, 'StepName');
      const description = this.getChildTextContent(stepEl, 'Description');

      const operation = this.createOperation(id, name, sequence);
      if (description) operation.description = description;

      // Parse tasks (map to phases)
      const tasksElement = this.getFirstElement(stepEl, 'Tasks');
      if (tasksElement) {
        operation.phases = this.parseTasks(tasksElement, warnings);
      }

      // Parse step-level signatures
      const signoffsElement = this.getFirstElement(stepEl, 'StepSignoffs');
      if (signoffsElement) {
        operation.signatures = this.parseESignatures(signoffsElement);
      }

      // Parse cleaning requirement
      const cleaningElement = this.getFirstElement(stepEl, 'CleaningRequirement');
      if (cleaningElement) {
        operation.cleaningRequired = this.parseBoolean(this.getFirstElement(cleaningElement, 'Required'));
        const cleaningType = this.getChildTextContent(cleaningElement, 'Type').toLowerCase();
        if (cleaningType === 'minor' || cleaningType === 'major' || cleaningType === 'campaign') {
          operation.cleaningType = cleaningType;
        }
      }

      operations.push(operation);
    });

    return operations;
  }

  private parseTasks(element: XmlElement, warnings: string[]): Phase[] {
    const phases: Phase[] = [];
    const taskElements = this.getElements(element, 'Task');

    taskElements.forEach(taskEl => {
      const sequence = parseInt(this.getAttribute(taskEl, 'sequence'), 10) || phases.length + 1;
      const id = this.getChildTextContent(taskEl, 'TaskId');
      const name = this.getChildTextContent(taskEl, 'TaskName');
      const taskType = this.getChildTextContent(taskEl, 'TaskType');
      const description = this.getChildTextContent(taskEl, 'Description');

      const phase = this.createPhase(id, name, sequence, this.mapPhaseType(taskType));
      if (description) phase.description = description;

      // Parse instruction
      const instructionEl = this.getFirstElement(taskEl, 'Instruction');
      if (instructionEl) {
        phase.instructions = this.getChildTextContent(instructionEl, 'InstructionText');
      }

      // Parse data entry fields (map to parameters)
      const dataEntryEl = this.getFirstElement(taskEl, 'DataEntry');
      if (dataEntryEl) {
        phase.parameters = this.parseDataEntryFields(dataEntryEl);
      }

      // Parse material verification
      const materialVerificationEl = this.getFirstElement(taskEl, 'MaterialVerification');
      if (materialVerificationEl) {
        phase.materials = this.parseMaterialVerification(materialVerificationEl);
      }

      // Parse task signatures
      const signaturesEl = this.getFirstElement(taskEl, 'TaskSignatures');
      if (signaturesEl) {
        phase.signatures = this.parseESignatures(signaturesEl);
      }

      // Parse integration points (interfaces)
      const integrationEl = this.getFirstElement(taskEl, 'IntegrationPoints');
      if (integrationEl) {
        phase.interfaces = this.parseIntegrationPoints(integrationEl);
      }

      // Parse expected duration
      const durationEl = this.getFirstElement(taskEl, 'ExpectedDuration');
      if (durationEl) {
        const value = this.parseNumber(this.getFirstElement(durationEl, 'Value'));
        const unit = this.getChildTextContent(durationEl, 'Unit').toLowerCase();
        phase.duration = {
          estimated: value,
          unit: (unit === 'seconds' || unit === 'minutes' || unit === 'hours') ? unit : 'minutes',
        };
      }

      phases.push(phase);
    });

    return phases;
  }

  private parseDataEntryFields(element: XmlElement): Parameter[] {
    const parameters: Parameter[] = [];
    const fieldElements = this.getElements(element, 'Field');

    fieldElements.forEach(fieldEl => {
      const id = this.getChildTextContent(fieldEl, 'FieldId');
      const name = this.getChildTextContent(fieldEl, 'FieldName');
      const dataTypeStr = this.getChildTextContent(fieldEl, 'DataType');
      const defaultValue = this.getChildTextContent(fieldEl, 'DefaultValue');
      const unit = this.getChildTextContent(fieldEl, 'Unit');
      const required = this.parseBoolean(this.getFirstElement(fieldEl, 'Required'));

      const param = this.createParameter(id, name, this.mapDataType(dataTypeStr));
      if (defaultValue) param.defaultValue = defaultValue;
      if (unit) param.unit = unit;
      param.required = required;

      // Parse limits
      const limitsEl = this.getFirstElement(fieldEl, 'Limits');
      if (limitsEl) {
        const lower = this.getChildTextContent(limitsEl, 'Lower');
        const upper = this.getChildTextContent(limitsEl, 'Upper');
        if (lower) param.minimum = parseFloat(lower);
        if (upper) param.maximum = parseFloat(upper);
      }

      parameters.push(param);
    });

    return parameters;
  }

  private parseMaterialVerification(element: XmlElement): Material[] {
    const materials: Material[] = [];
    const materialElements = this.getElements(element, 'Material');

    materialElements.forEach(matEl => {
      const code = this.getChildTextContent(matEl, 'MaterialCode');
      const name = this.getChildTextContent(matEl, 'MaterialName');
      const quantity = this.parseNumber(this.getFirstElement(matEl, 'TargetQuantity'));
      const unit = this.getChildTextContent(matEl, 'Unit');
      const tolerancePlus = this.getChildTextContent(matEl, 'TolerancePlus');
      const toleranceMinus = this.getChildTextContent(matEl, 'ToleranceMinus');

      const material = this.createMaterial(code, code, name, quantity, unit);
      if (tolerancePlus) material.tolerancePlus = parseFloat(tolerancePlus);
      if (toleranceMinus) material.toleranceMinus = parseFloat(toleranceMinus);

      materials.push(material);
    });

    return materials;
  }

  private parseESignatures(element: XmlElement): Signature[] {
    const signatures: Signature[] = [];
    const sigElements = this.getElements(element, 'ESignature');

    sigElements.forEach(sigEl => {
      const id = this.getChildTextContent(sigEl, 'SignatureId');
      const typeStr = this.getChildTextContent(sigEl, 'SignatureType');
      const role = this.getChildTextContent(sigEl, 'Role');
      const sequence = this.parseInt(this.getFirstElement(sigEl, 'Sequence'), 1);
      const required = this.parseBoolean(this.getFirstElement(sigEl, 'Required'), true);
      const meaning = this.getChildTextContent(sigEl, 'Meaning');

      const signature = this.createSignature(id, this.mapSignatureType(typeStr), role, sequence);
      signature.required = required;
      if (meaning) signature.meaning = meaning;

      signatures.push(signature);
    });

    return signatures;
  }

  private parseEquipmentAllocation(element: XmlElement): Equipment[] {
    const equipment: Equipment[] = [];
    const equipElements = this.getElements(element, 'Equipment');

    equipElements.forEach(equipEl => {
      const id = this.getChildTextContent(equipEl, 'EquipmentId');
      const name = this.getChildTextContent(equipEl, 'EquipmentName');

      equipment.push(this.createEquipment(id, id, name, 'General'));
    });

    return equipment;
  }

  private parseIntegrationPoints(element: XmlElement): InterfacePoint[] {
    const interfaces: InterfacePoint[] = [];
    const integrationElements = this.getElements(element, 'Integration');

    integrationElements.forEach((intEl, idx) => {
      const system = this.getChildTextContent(intEl, 'System');
      const directionStr = this.getChildTextContent(intEl, 'Direction').toLowerCase();

      const direction: 'input' | 'output' | 'bidirectional' =
        directionStr === 'input' ? 'input' :
        directionStr === 'output' ? 'output' : 'bidirectional';

      interfaces.push(this.createInterfacePoint(
        `integration-${idx + 1}`,
        this.mapInterfaceSystem(system),
        direction
      ));
    });

    return interfaces;
  }

  // Unmapped data parsers

  private parseFormSections(element: XmlElement): unknown[] {
    const sections: unknown[] = [];
    const sectionElements = this.getElements(element, 'Section');

    sectionElements.forEach(secEl => {
      const sequence = parseInt(this.getAttribute(secEl, 'sequence'), 10);
      const sectionId = this.getChildTextContent(secEl, 'SectionId');
      const sectionTitle = this.getChildTextContent(secEl, 'SectionTitle');

      sections.push({ sequence, sectionId, sectionTitle });
    });

    return sections;
  }

  private parseDeviationHandling(element: XmlElement): Record<string, unknown> {
    const workflowEl = this.getFirstElement(element, 'DeviationWorkflow');
    return {
      enabled: workflowEl ? this.parseBoolean(this.getFirstElement(workflowEl, 'Enabled')) : false,
      autoCapture: workflowEl ? this.parseBoolean(this.getFirstElement(workflowEl, 'AutoCapture')) : false,
    };
  }

  private parseCalculationsConfig(element: XmlElement): Record<string, unknown> {
    return {
      autoCalculate: this.parseBoolean(this.getFirstElement(element, 'AutoCalculate')),
      recalculateOnChange: this.parseBoolean(this.getFirstElement(element, 'RecalculateOnChange')),
    };
  }

  private parseAttachmentConfig(element: XmlElement): Record<string, unknown> {
    return {
      allowAttachments: this.parseBoolean(this.getFirstElement(element, 'AllowAttachments')),
    };
  }

  /**
   * Override to handle MODA-specific status mappings
   */
  protected mapStatus(status: string): 'draft' | 'approved' | 'released' | 'obsolete' {
    const normalized = status.toLowerCase().replace(/[_-]/g, '');

    // MODA uses "EFFECTIVE" for released and "SUPERSEDED" for obsolete
    const mapping: Record<string, 'draft' | 'approved' | 'released' | 'obsolete'> = {
      draft: 'draft',
      approved: 'approved',
      effective: 'released',
      released: 'released',
      superseded: 'obsolete',
      obsolete: 'obsolete',
    };

    return mapping[normalized] || 'draft';
  }

  /**
   * Override to handle MODA-specific phase type mappings
   */
  protected mapPhaseType(type: string): 'manual' | 'automatic' | 'semi-automatic' {
    const normalized = type.toLowerCase().replace(/[_-]/g, '');

    // MODA uses "GUIDED" for semi-automatic
    const mapping: Record<string, 'manual' | 'automatic' | 'semi-automatic'> = {
      manual: 'manual',
      automatic: 'automatic',
      guided: 'semi-automatic',
      semiautomatic: 'semi-automatic',
    };

    return mapping[normalized] || 'manual';
  }
}

// Export singleton instance
export const modaParser = new ModaParser();
