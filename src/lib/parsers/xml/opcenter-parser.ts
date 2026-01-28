/**
 * Opcenter Parser
 *
 * Parses Siemens Opcenter Execution Pharma XML format to ISA-88 canonical model.
 * This parser reverses the logic from opcenter-generator.ts.
 *
 * Expected XML structure:
 * <OpcenterRecipe xmlns="http://www.siemens.com/opcenter/pharma">
 *   <MasterData>
 *     <ProductDefinition>...</ProductDefinition>
 *     <EquipmentDefinitions>...</EquipmentDefinitions>
 *   </MasterData>
 *   <ProcessDefinition>
 *     <ProcessRouting>
 *       <RoutingStep>
 *         <Operations>
 *           <Operation>
 *             <Tasks>
 *               <Task>...</Task>
 *             </Tasks>
 *           </Operation>
 *         </Operations>
 *       </RoutingStep>
 *     </ProcessRouting>
 *   </ProcessDefinition>
 *   <ElectronicWorkInstructions>...</ElectronicWorkInstructions>
 *   <MaterialTrackingConfiguration>...</MaterialTrackingConfiguration>
 *   <GenealogyConfiguration>...</GenealogyConfiguration>
 *   <ComplianceSettings>...</ComplianceSettings>
 * </OpcenterRecipe>
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

export class OpcenterParser extends BaseParser {
  readonly id: MESSystemId = 'opcenter';
  readonly name = 'Siemens Opcenter';
  readonly description = 'Siemens Opcenter Execution Pharma (formerly SIMATIC IT) XML Parser';
  readonly vendor = 'Siemens';
  readonly rootElement = 'OpcenterRecipe';
  readonly namespace = 'http://www.siemens.com/opcenter/pharma';
  readonly supportedVersions = ['8.0', '8.1', '8.2', '2020', '2022'];

  parse(xml: string, options?: ParserOptions): ParserResult {
    const opts = { ...this.getDefaultOptions(), ...options };
    const warnings: string[] = [];
    const unmappedData: Record<string, unknown> = {};

    const doc = this.parseXmlDocument(xml);
    const root = doc.documentElement;

    if (!root || (root.localName !== 'OpcenterRecipe' && root.nodeName !== 'OpcenterRecipe')) {
      throw new Error('Invalid Opcenter XML: Root element must be <OpcenterRecipe>');
    }

    // Parse master data
    const masterDataElement = this.getFirstElement(root, 'MasterData');
    const procedure = this.parseMasterData(masterDataElement, warnings);

    // Parse process definition
    const processDefElement = this.getFirstElement(root, 'ProcessDefinition');
    if (processDefElement) {
      this.parseProcessDefinition(processDefElement, procedure, warnings);
    } else {
      warnings.push('No ProcessDefinition element found');
    }

    // Parse and preserve additional sections as unmapped data
    if (opts.preserveUnmappedData) {
      const ewiElement = this.getFirstElement(root, 'ElectronicWorkInstructions');
      if (ewiElement) {
        unmappedData.electronicWorkInstructions = this.parseEWI(ewiElement);
      }

      const matTrackElement = this.getFirstElement(root, 'MaterialTrackingConfiguration');
      if (matTrackElement) {
        unmappedData.materialTracking = this.parseMaterialTracking(matTrackElement);
      }

      const genealogyElement = this.getFirstElement(root, 'GenealogyConfiguration');
      if (genealogyElement) {
        unmappedData.genealogy = this.parseGenealogy(genealogyElement);
      }

      const complianceElement = this.getFirstElement(root, 'ComplianceSettings');
      if (complianceElement) {
        unmappedData.complianceSettings = this.parseComplianceSettings(complianceElement);
      }
    }

    const version = this.detectVersion(xml);
    const result = this.createResult(procedure, warnings, opts.preserveUnmappedData ? unmappedData : undefined);

    if (version) {
      result.sourceVersion = version;
    }

    return result;
  }

  private parseMasterData(element: XmlElement | null, warnings: string[]): Procedure {
    if (!element) {
      warnings.push('No MasterData element found');
      return this.createBaseProcedure('', 'Unnamed Recipe');
    }

    const productDefElement = this.getFirstElement(element, 'ProductDefinition');
    const procedure = this.parseProductDefinition(productDefElement, warnings);

    // Parse equipment definitions
    const equipDefElement = this.getFirstElement(element, 'EquipmentDefinitions');
    if (equipDefElement) {
      procedure.equipmentRequirements = this.parseEquipmentDefinitions(equipDefElement);
    }

    return procedure;
  }

  private parseProductDefinition(element: XmlElement | null, warnings: string[]): Procedure {
    if (!element) {
      warnings.push('No ProductDefinition element found');
      return this.createBaseProcedure('', 'Unnamed Recipe');
    }

    const id = this.getChildTextContent(element, 'ProductId');
    const name = this.getChildTextContent(element, 'ProductName');
    const version = this.getChildTextContent(element, 'ProductVersion') || '1.0';
    const productCode = this.getChildTextContent(element, 'ProductCode');
    const statusStr = this.getChildTextContent(element, 'Status');
    const validFrom = this.getChildTextContent(element, 'ValidFrom');
    const modifiedOn = this.getChildTextContent(element, 'ModifiedOn');
    const createdBy = this.getChildTextContent(element, 'CreatedBy');

    const procedure = this.createBaseProcedure(id, name, version);
    procedure.header.status = this.mapStatus(statusStr);

    if (productCode) procedure.header.productCode = productCode;
    if (validFrom) procedure.header.createdDate = validFrom;
    if (modifiedOn) procedure.header.modifiedDate = modifiedOn;
    if (createdBy) procedure.header.author = createdBy;

    return procedure;
  }

  private parseEquipmentDefinitions(element: XmlElement): Equipment[] {
    const equipment: Equipment[] = [];
    const equipElements = this.getElements(element, 'Equipment');

    equipElements.forEach(eqEl => {
      const id = this.getChildTextContent(eqEl, 'EquipmentId');
      const name = this.getChildTextContent(eqEl, 'EquipmentName');
      const type = this.getChildTextContent(eqEl, 'EquipmentType');

      const eq = this.createEquipment(id, id, name, type);

      // Parse capabilities
      const capabilitiesEl = this.getFirstElement(eqEl, 'Capabilities');
      if (capabilitiesEl) {
        const capElements = this.getElements(capabilitiesEl, 'Capability');
        eq.capabilities = capElements.map(c => this.getTextContent(c));
      }

      equipment.push(eq);
    });

    return equipment;
  }

  private parseProcessDefinition(element: XmlElement, procedure: Procedure, warnings: string[]): void {
    // Get process metadata
    const processId = this.getChildTextContent(element, 'ProcessId');
    const processName = this.getChildTextContent(element, 'ProcessName');
    const processVersion = this.getChildTextContent(element, 'ProcessVersion');

    if (processVersion && !procedure.header.version) {
      procedure.header.version = processVersion;
    }

    // Parse routing steps (map to unit procedures)
    const routingElement = this.getFirstElement(element, 'ProcessRouting');
    if (routingElement) {
      procedure.unitProcedures = this.parseProcessRouting(routingElement, warnings);
    }
  }

  private parseProcessRouting(element: XmlElement, warnings: string[]): UnitProcedure[] {
    const unitProcedures: UnitProcedure[] = [];
    const stepElements = this.getElements(element, 'RoutingStep');

    stepElements.forEach((stepEl, idx) => {
      const id = this.getChildTextContent(stepEl, 'StepId');
      const name = this.getChildTextContent(stepEl, 'StepName');
      const sequence = this.parseInt(this.getFirstElement(stepEl, 'Sequence'), idx + 1);
      const description = this.getChildTextContent(stepEl, 'Description');

      const unitProcedure = this.createUnitProcedure(id, name, sequence);
      if (description) unitProcedure.description = description;

      // Parse operations
      const operationsEl = this.getFirstElement(stepEl, 'Operations');
      if (operationsEl) {
        unitProcedure.operations = this.parseOperations(operationsEl, warnings);
      }

      // Parse signatures at unit procedure level
      const signoffsEl = this.getFirstElement(stepEl, 'SignoffRequirements');
      if (signoffsEl) {
        unitProcedure.signatures = this.parseSignoffs(signoffsEl);
      }

      // Parse equipment requirements
      const equipReqEl = this.getFirstElement(stepEl, 'EquipmentRequirements');
      if (equipReqEl) {
        unitProcedure.equipment = this.parseEquipmentRequirements(equipReqEl);
      }

      unitProcedures.push(unitProcedure);
    });

    return unitProcedures;
  }

  private parseOperations(element: XmlElement, warnings: string[]): Operation[] {
    const operations: Operation[] = [];
    const opElements = this.getElements(element, 'Operation');

    opElements.forEach((opEl, idx) => {
      const id = this.getChildTextContent(opEl, 'OperationId');
      const name = this.getChildTextContent(opEl, 'OperationName');
      const sequence = this.parseInt(this.getFirstElement(opEl, 'Sequence'), idx + 1);
      const description = this.getChildTextContent(opEl, 'Description');

      const operation = this.createOperation(id, name, sequence);
      if (description) operation.description = description;

      // Parse tasks (map to phases)
      const tasksEl = this.getFirstElement(opEl, 'Tasks');
      if (tasksEl) {
        operation.phases = this.parseTasks(tasksEl, warnings);
      }

      // Parse signatures at operation level
      const signoffsEl = this.getFirstElement(opEl, 'Signoffs');
      if (signoffsEl) {
        operation.signatures = this.parseSignoffs(signoffsEl);
      }

      // Parse cleaning requirement
      const cleaningEl = this.getFirstElement(opEl, 'CleaningRequirement');
      if (cleaningEl) {
        operation.cleaningRequired = this.parseBoolean(this.getFirstElement(cleaningEl, 'Required'));
        const cleaningType = this.getChildTextContent(cleaningEl, 'CleaningType').toLowerCase();
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

    taskElements.forEach((taskEl, idx) => {
      const id = this.getChildTextContent(taskEl, 'TaskId');
      const name = this.getChildTextContent(taskEl, 'TaskName');
      const sequence = this.parseInt(this.getFirstElement(taskEl, 'Sequence'), idx + 1);
      const executionMode = this.getChildTextContent(taskEl, 'ExecutionMode');
      const description = this.getChildTextContent(taskEl, 'Description');

      const phase = this.createPhase(id, name, sequence, this.mapPhaseType(executionMode));
      if (description) phase.description = description;

      // Parse work instruction
      const workInstrEl = this.getFirstElement(taskEl, 'WorkInstruction');
      if (workInstrEl) {
        phase.instructions = this.getChildTextContent(workInstrEl, 'InstructionText');
      }

      // Parse parameters
      const paramsEl = this.getFirstElement(taskEl, 'ProcessParameters');
      if (paramsEl) {
        phase.parameters = this.parseProcessParameters(paramsEl);
      }

      // Parse materials
      const materialsEl = this.getFirstElement(taskEl, 'MaterialConsumption');
      if (materialsEl) {
        phase.materials = this.parseMaterialConsumption(materialsEl);
      }

      // Parse signatures
      const signaturesEl = this.getFirstElement(taskEl, 'ElectronicSignatures');
      if (signaturesEl) {
        phase.signatures = this.parseSignoffs(signaturesEl);
      }

      // Parse duration
      const durationEl = this.getFirstElement(taskEl, 'PlannedDuration');
      if (durationEl) {
        const value = this.parseNumber(this.getFirstElement(durationEl, 'Value'));
        const unit = this.getChildTextContent(durationEl, 'Unit').toLowerCase();
        phase.duration = {
          estimated: value,
          unit: (unit === 'seconds' || unit === 'minutes' || unit === 'hours') ? unit : 'minutes',
        };
      }

      // Parse interfaces
      const interfacesEl = this.getFirstElement(taskEl, 'SystemInterfaces');
      if (interfacesEl) {
        phase.interfaces = this.parseSystemInterfaces(interfacesEl);
      }

      phases.push(phase);
    });

    return phases;
  }

  private parseProcessParameters(element: XmlElement): Parameter[] {
    const parameters: Parameter[] = [];
    const paramElements = this.getElements(element, 'ProcessParameter');

    paramElements.forEach(paramEl => {
      const id = this.getChildTextContent(paramEl, 'ParameterId');
      const name = this.getChildTextContent(paramEl, 'ParameterName');
      const dataTypeStr = this.getChildTextContent(paramEl, 'DataType');
      const targetValue = this.getChildTextContent(paramEl, 'TargetValue');
      const unit = this.getChildTextContent(paramEl, 'UOM');
      const lowerLimit = this.getChildTextContent(paramEl, 'LowerLimit');
      const upperLimit = this.getChildTextContent(paramEl, 'UpperLimit');
      const required = this.parseBoolean(this.getFirstElement(paramEl, 'Required'));

      const param = this.createParameter(id, name, this.mapDataType(dataTypeStr));
      if (targetValue) param.value = targetValue;
      if (unit) param.unit = unit;
      if (lowerLimit) param.minimum = parseFloat(lowerLimit);
      if (upperLimit) param.maximum = parseFloat(upperLimit);
      param.required = required;

      parameters.push(param);
    });

    return parameters;
  }

  private parseMaterialConsumption(element: XmlElement): Material[] {
    const materials: Material[] = [];
    const itemElements = this.getElements(element, 'MaterialItem');

    itemElements.forEach(itemEl => {
      const code = this.getChildTextContent(itemEl, 'MaterialCode');
      const name = this.getChildTextContent(itemEl, 'MaterialName');
      const quantity = this.parseNumber(this.getFirstElement(itemEl, 'Quantity'));
      const unit = this.getChildTextContent(itemEl, 'UOM');
      const scalable = this.parseBoolean(this.getFirstElement(itemEl, 'Scalable'), true);
      const tolerancePlus = this.getChildTextContent(itemEl, 'TolerancePlus');
      const toleranceMinus = this.getChildTextContent(itemEl, 'ToleranceMinus');

      const material = this.createMaterial(code, code, name, quantity, unit);
      material.scalable = scalable;
      if (tolerancePlus) material.tolerancePlus = parseFloat(tolerancePlus);
      if (toleranceMinus) material.toleranceMinus = parseFloat(toleranceMinus);

      materials.push(material);
    });

    return materials;
  }

  private parseSignoffs(element: XmlElement): Signature[] {
    const signatures: Signature[] = [];
    const signoffElements = this.getElements(element, 'Signoff');

    signoffElements.forEach(sigEl => {
      const id = this.getChildTextContent(sigEl, 'SignoffId');
      const typeStr = this.getChildTextContent(sigEl, 'SignoffType');
      const role = this.getChildTextContent(sigEl, 'Role');
      const sequence = this.parseInt(this.getFirstElement(sigEl, 'Sequence'), 1);
      const mandatory = this.parseBoolean(this.getFirstElement(sigEl, 'Mandatory'), true);
      const meaning = this.getChildTextContent(sigEl, 'Meaning');
      const timeLimit = this.parseInt(this.getFirstElement(sigEl, 'TimeLimit'));

      const signature = this.createSignature(id, this.mapSignatureType(typeStr), role, sequence);
      signature.required = mandatory;
      if (meaning) signature.meaning = meaning;
      if (timeLimit > 0) signature.timeLimit = timeLimit;

      signatures.push(signature);
    });

    return signatures;
  }

  private parseEquipmentRequirements(element: XmlElement): Equipment[] {
    const equipment: Equipment[] = [];
    const reqElements = this.getElements(element, 'EquipmentRequirement');

    reqElements.forEach(reqEl => {
      const ref = this.getChildTextContent(reqEl, 'EquipmentRef');
      if (ref) {
        equipment.push(this.createEquipment(ref, ref, ref, 'General'));
      }
    });

    return equipment;
  }

  private parseSystemInterfaces(element: XmlElement): InterfacePoint[] {
    const interfaces: InterfacePoint[] = [];
    const ifaceElements = this.getElements(element, 'Interface');

    ifaceElements.forEach((ifEl, idx) => {
      const systemId = this.getChildTextContent(ifEl, 'SystemId');
      const directionStr = this.getChildTextContent(ifEl, 'Direction').toLowerCase();

      const direction: 'input' | 'output' | 'bidirectional' =
        directionStr === 'input' ? 'input' :
        directionStr === 'output' ? 'output' : 'bidirectional';

      interfaces.push(this.createInterfacePoint(
        `iface-${idx + 1}`,
        this.mapInterfaceSystem(systemId),
        direction
      ));
    });

    return interfaces;
  }

  // Unmapped data parsers for preserveUnmappedData option

  private parseEWI(element: XmlElement): Record<string, unknown> {
    const defEl = this.getFirstElement(element, 'EWIDefinition');
    if (!defEl) return {};

    return {
      ewiId: this.getChildTextContent(defEl, 'EWIId'),
      ewiName: this.getChildTextContent(defEl, 'EWIName'),
      version: this.getChildTextContent(defEl, 'Version'),
    };
  }

  private parseMaterialTracking(element: XmlElement): Record<string, unknown> {
    return {
      trackingMode: this.getChildTextContent(element, 'TrackingMode'),
      enableGenealogyTracking: this.parseBoolean(this.getFirstElement(element, 'EnableGenealogyTracking')),
      enableExpiryValidation: this.parseBoolean(this.getFirstElement(element, 'EnableExpiryValidation')),
    };
  }

  private parseGenealogy(element: XmlElement): Record<string, unknown> {
    return {
      enableGenealogy: this.parseBoolean(this.getFirstElement(element, 'EnableGenealogy')),
      traceabilityLevel: this.getChildTextContent(element, 'TraceabilityLevel'),
    };
  }

  private parseComplianceSettings(element: XmlElement): Record<string, unknown> {
    return {
      complianceMode: this.getChildTextContent(element, 'ComplianceMode'),
      auditTrailEnabled: this.parseBoolean(
        this.getFirstElement(this.getFirstElement(element, 'AuditTrail')!, 'Enabled')
      ),
      part11Compliant: this.parseBoolean(
        this.getFirstElement(this.getFirstElement(element, 'ElectronicSignature')!, 'Part11Compliant')
      ),
    };
  }
}

// Export singleton instance
export const opcenterParser = new OpcenterParser();
