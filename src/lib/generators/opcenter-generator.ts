/**
 * Opcenter Generator
 *
 * Generates Siemens Opcenter Execution Pharma compatible XML from ISA-88 canonical model.
 * Opcenter (formerly SIMATIC IT) follows ISA-95 standards and supports pharmaceutical
 * manufacturing with GxP compliance features.
 */

import {
  Procedure,
  UnitProcedure,
  Operation,
  Phase,
  SignatureType,
} from '../models/isa88-canonical';
import { BaseGenerator, GeneratorOptions, GeneratorResult } from './base-generator';

export interface OpcenterOptions extends GeneratorOptions {
  plantId?: string;
  workCenterId?: string;
  includeEWI?: boolean;
  includeMaterialTracking?: boolean;
  includeGenealogyConfig?: boolean;
  complianceMode?: 'GMP' | 'GLP' | 'GCP' | 'standard';
}

export class OpcenterGenerator extends BaseGenerator {
  readonly id = 'opcenter';
  readonly name = 'Siemens Opcenter';
  readonly description = 'Siemens Opcenter Execution Pharma (formerly SIMATIC IT)';
  readonly vendor = 'Siemens';
  readonly supportedVersions = ['8.0', '8.1', '8.2', '2020', '2022'];

  private readonly namespace = 'http://www.siemens.com/opcenter/pharma';

  generate(procedure: Procedure, options?: OpcenterOptions): GeneratorResult {
    const opts: OpcenterOptions = {
      ...this.getDefaultOptions(),
      ...options,
    };

    const xml = this.buildXml(procedure, opts);
    const stats = this.generateStatistics(procedure);

    return {
      content: opts.prettyPrint ? this.formatXml(xml) : xml,
      format: 'Opcenter Pharma Recipe',
      mimeType: 'application/xml',
      fileExtension: 'xml',
      metadata: {
        generator: this.id,
        version: opts.targetVersion || '2022',
        generatedAt: new Date().toISOString(),
        procedureName: procedure.header.name,
        statistics: stats,
      },
    };
  }

  getDefaultOptions(): OpcenterOptions {
    return {
      ...super.getDefaultOptions(),
      plantId: 'PLANT-001',
      workCenterId: 'WC-001',
      includeEWI: true,
      includeMaterialTracking: true,
      includeGenealogyConfig: true,
      complianceMode: 'GMP',
    };
  }

  private buildXml(procedure: Procedure, options: OpcenterOptions): string {
    const parts: string[] = [];

    // XML Declaration
    parts.push(`<?xml version="1.0" encoding="${options.encoding || 'UTF-8'}"?>`);

    // Root element
    parts.push(`<OpcenterRecipe xmlns="${this.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`);

    // Master Data Definition
    parts.push(this.buildMasterData(procedure, options));

    // Process Definition
    parts.push(this.buildProcessDefinition(procedure, options));

    // Electronic Work Instructions (EWI)
    if (options.includeEWI) {
      parts.push(this.buildEWI(procedure));
    }

    // Material Tracking Configuration
    if (options.includeMaterialTracking) {
      parts.push(this.buildMaterialTracking(procedure));
    }

    // Genealogy Configuration
    if (options.includeGenealogyConfig) {
      parts.push(this.buildGenealogyConfig(procedure));
    }

    // Compliance Settings
    parts.push(this.buildComplianceSettings(procedure, options));

    // Close root
    parts.push('</OpcenterRecipe>');

    return parts.join('\n');
  }

  private buildMasterData(procedure: Procedure, options: OpcenterOptions): string {
    const h = procedure.header;
    return `
  <MasterData>
    <ProductDefinition>
      <ProductId>${this.escapeXml(h.id)}</ProductId>
      <ProductName>${this.escapeXml(h.name)}</ProductName>
      <ProductVersion>${this.escapeXml(h.version)}</ProductVersion>
      ${h.productCode ? `<ProductCode>${this.escapeXml(h.productCode)}</ProductCode>` : ''}
      <ProductionPlant>${options.plantId}</ProductionPlant>
      <Status>${this.mapStatus(h.status)}</Status>
      <ValidFrom>${h.createdDate}</ValidFrom>
      <ModifiedOn>${h.modifiedDate}</ModifiedOn>
      ${h.author ? `<CreatedBy>${this.escapeXml(h.author)}</CreatedBy>` : ''}
    </ProductDefinition>

    ${procedure.equipmentRequirements.length > 0 ? `
    <EquipmentDefinitions>
      ${procedure.equipmentRequirements.map(eq => `
      <Equipment>
        <EquipmentId>${this.escapeXml(eq.id)}</EquipmentId>
        <EquipmentName>${this.escapeXml(eq.name)}</EquipmentName>
        <EquipmentType>${this.escapeXml(eq.type)}</EquipmentType>
        <WorkCenter>${options.workCenterId}</WorkCenter>
        ${eq.capabilities?.length ? `
        <Capabilities>
          ${eq.capabilities.map(cap => `<Capability>${this.escapeXml(cap)}</Capability>`).join('')}
        </Capabilities>` : ''}
      </Equipment>`).join('')}
    </EquipmentDefinitions>` : ''}
  </MasterData>`;
  }

  private buildProcessDefinition(procedure: Procedure, options: OpcenterOptions): string {
    return `
  <ProcessDefinition>
    <ProcessId>PROC-${procedure.header.id}</ProcessId>
    <ProcessName>${this.escapeXml(procedure.header.name)} Process</ProcessName>
    <ProcessVersion>${procedure.header.version}</ProcessVersion>

    <ProcessRouting>
      ${procedure.unitProcedures.map(up => this.buildRoutingStep(up, options)).join('')}
    </ProcessRouting>

    <BillOfProcess>
      ${procedure.unitProcedures.map((up, idx) => `
      <BOPItem sequence="${idx + 1}">
        <StepReference>${this.escapeXml(up.id)}</StepReference>
        <Mandatory>true</Mandatory>
        <AllowSkip>false</AllowSkip>
      </BOPItem>`).join('')}
    </BillOfProcess>
  </ProcessDefinition>`;
  }

  private buildRoutingStep(up: UnitProcedure, options: OpcenterOptions): string {
    return `
      <RoutingStep>
        <StepId>${this.escapeXml(up.id)}</StepId>
        <StepName>${this.escapeXml(up.name)}</StepName>
        <Sequence>${up.sequence}</Sequence>
        ${up.description ? `<Description>${this.escapeXml(up.description)}</Description>` : ''}
        <WorkCenter>${options.workCenterId}</WorkCenter>

        <Operations>
          ${up.operations.map(op => this.buildOperationStep(op)).join('')}
        </Operations>

        ${up.signatures.length > 0 ? `
        <SignoffRequirements>
          ${up.signatures.map(sig => this.buildSignoffRequirement(sig)).join('')}
        </SignoffRequirements>` : ''}

        ${up.equipment.length > 0 ? `
        <EquipmentRequirements>
          ${up.equipment.map(eq => `
          <EquipmentRequirement>
            <EquipmentRef>${this.escapeXml(eq.id)}</EquipmentRef>
            <Required>true</Required>
          </EquipmentRequirement>`).join('')}
        </EquipmentRequirements>` : ''}
      </RoutingStep>`;
  }

  private buildOperationStep(op: Operation): string {
    return `
          <Operation>
            <OperationId>${this.escapeXml(op.id)}</OperationId>
            <OperationName>${this.escapeXml(op.name)}</OperationName>
            <Sequence>${op.sequence}</Sequence>
            ${op.description ? `<Description>${this.escapeXml(op.description)}</Description>` : ''}

            <Tasks>
              ${op.phases.map(ph => this.buildTask(ph)).join('')}
            </Tasks>

            ${op.signatures.length > 0 ? `
            <Signoffs>
              ${op.signatures.map(sig => this.buildSignoffRequirement(sig)).join('')}
            </Signoffs>` : ''}

            ${op.cleaningRequired ? `
            <CleaningRequirement>
              <Required>true</Required>
              <CleaningType>${(op.cleaningType || 'STANDARD').toUpperCase()}</CleaningType>
            </CleaningRequirement>` : ''}
          </Operation>`;
  }

  private buildTask(phase: Phase): string {
    return `
              <Task>
                <TaskId>${this.escapeXml(phase.id)}</TaskId>
                <TaskName>${this.escapeXml(phase.name)}</TaskName>
                <Sequence>${phase.sequence}</Sequence>
                <ExecutionMode>${this.mapPhaseType(phase.type)}</ExecutionMode>
                ${phase.description ? `<Description>${this.escapeXml(phase.description)}</Description>` : ''}

                ${phase.instructions ? `
                <WorkInstruction>
                  <InstructionText>${this.escapeXml(phase.instructions)}</InstructionText>
                  <InstructionType>TEXT</InstructionType>
                </WorkInstruction>` : ''}

                ${phase.parameters.length > 0 ? `
                <ProcessParameters>
                  ${phase.parameters.map(p => `
                  <ProcessParameter>
                    <ParameterId>${this.escapeXml(p.id)}</ParameterId>
                    <ParameterName>${this.escapeXml(p.name)}</ParameterName>
                    <DataType>${this.mapDataType(p.dataType)}</DataType>
                    ${p.value !== undefined ? `<TargetValue>${p.value}</TargetValue>` : ''}
                    ${p.unit ? `<UOM>${this.escapeXml(p.unit)}</UOM>` : ''}
                    ${p.minimum !== undefined ? `<LowerLimit>${p.minimum}</LowerLimit>` : ''}
                    ${p.maximum !== undefined ? `<UpperLimit>${p.maximum}</UpperLimit>` : ''}
                    <Required>${p.required}</Required>
                  </ProcessParameter>`).join('')}
                </ProcessParameters>` : ''}

                ${phase.materials.length > 0 ? `
                <MaterialConsumption>
                  ${phase.materials.map(m => `
                  <MaterialItem>
                    <MaterialCode>${this.escapeXml(m.code)}</MaterialCode>
                    <MaterialName>${this.escapeXml(m.name)}</MaterialName>
                    <Quantity>${m.quantity}</Quantity>
                    <UOM>${this.escapeXml(m.unit)}</UOM>
                    <Scalable>${m.scalable}</Scalable>
                    ${m.tolerancePlus !== undefined ? `<TolerancePlus>${m.tolerancePlus}</TolerancePlus>` : ''}
                    ${m.toleranceMinus !== undefined ? `<ToleranceMinus>${m.toleranceMinus}</ToleranceMinus>` : ''}
                  </MaterialItem>`).join('')}
                </MaterialConsumption>` : ''}

                ${phase.signatures.length > 0 ? `
                <ElectronicSignatures>
                  ${phase.signatures.map(sig => this.buildSignoffRequirement(sig)).join('')}
                </ElectronicSignatures>` : ''}

                ${phase.duration ? `
                <PlannedDuration>
                  <Value>${phase.duration.estimated}</Value>
                  <Unit>${phase.duration.unit.toUpperCase()}</Unit>
                </PlannedDuration>` : ''}

                ${phase.interfaces.length > 0 ? `
                <SystemInterfaces>
                  ${phase.interfaces.map(iface => `
                  <Interface>
                    <SystemId>${iface.system}</SystemId>
                    <Direction>${iface.direction.toUpperCase()}</Direction>
                  </Interface>`).join('')}
                </SystemInterfaces>` : ''}
              </Task>`;
  }

  private buildSignoffRequirement(sig: Phase['signatures'][0]): string {
    return `
                  <Signoff>
                    <SignoffId>${this.escapeXml(sig.id)}</SignoffId>
                    <SignoffType>${this.mapSignatureType(sig.type)}</SignoffType>
                    <Role>${this.escapeXml(sig.role)}</Role>
                    <Sequence>${sig.order}</Sequence>
                    <Mandatory>${sig.required}</Mandatory>
                    ${sig.meaning ? `<Meaning>${this.escapeXml(sig.meaning)}</Meaning>` : ''}
                    ${sig.timeLimit ? `<TimeLimit>${sig.timeLimit}</TimeLimit>` : ''}
                  </Signoff>`;
  }

  private buildEWI(procedure: Procedure): string {
    return `
  <ElectronicWorkInstructions>
    <EWIDefinition>
      <EWIId>EWI-${procedure.header.id}</EWIId>
      <EWIName>${this.escapeXml(procedure.header.name)} Instructions</EWIName>
      <Version>${procedure.header.version}</Version>

      <Sections>
        ${procedure.unitProcedures.map((up, upIdx) => `
        <Section sequence="${upIdx + 1}">
          <SectionId>${this.escapeXml(up.id)}</SectionId>
          <SectionTitle>${this.escapeXml(up.name)}</SectionTitle>
          <Instructions>
            ${up.operations.flatMap(op => op.phases).map((ph, phIdx) => `
            <InstructionStep sequence="${phIdx + 1}">
              <StepId>${this.escapeXml(ph.id)}</StepId>
              <StepText>${this.escapeXml(ph.instructions || ph.name)}</StepText>
              <StepType>${this.mapPhaseType(ph.type)}</StepType>
              <RequiresAcknowledgment>true</RequiresAcknowledgment>
            </InstructionStep>`).join('')}
          </Instructions>
        </Section>`).join('')}
      </Sections>
    </EWIDefinition>
  </ElectronicWorkInstructions>`;
  }

  private buildMaterialTracking(procedure: Procedure): string {
    const materials = procedure.formula?.materials || [];
    return `
  <MaterialTrackingConfiguration>
    <TrackingMode>LOT_BASED</TrackingMode>
    <EnableGenealogyTracking>true</EnableGenealogyTracking>
    <EnableExpiryValidation>true</EnableExpiryValidation>

    ${materials.length > 0 ? `
    <MaterialDefinitions>
      ${materials.map(mat => `
      <MaterialDef>
        <MaterialCode>${this.escapeXml(mat.code)}</MaterialCode>
        <MaterialName>${this.escapeXml(mat.name)}</MaterialName>
        <TrackingLevel>LOT</TrackingLevel>
        <RequireLotNumber>true</RequireLotNumber>
        <ValidateExpiry>true</ValidateExpiry>
        ${mat.storageConditions ? `<StorageConditions>${this.escapeXml(mat.storageConditions)}</StorageConditions>` : ''}
      </MaterialDef>`).join('')}
    </MaterialDefinitions>` : ''}
  </MaterialTrackingConfiguration>`;
  }

  private buildGenealogyConfig(procedure: Procedure): string {
    return `
  <GenealogyConfiguration>
    <EnableGenealogy>true</EnableGenealogy>
    <TraceabilityLevel>FULL</TraceabilityLevel>
    <CapturePoints>
      ${procedure.unitProcedures.flatMap(up =>
        up.operations.flatMap(op =>
          op.phases.filter(ph => ph.materials.length > 0)
        )
      ).map(ph => `
      <CapturePoint>
        <PointId>${this.escapeXml(ph.id)}</PointId>
        <PointName>${this.escapeXml(ph.name)}</PointName>
        <CaptureType>CONSUMPTION</CaptureType>
      </CapturePoint>`).join('')}
    </CapturePoints>
    <LinkingRules>
      <Rule>LINK_INPUT_TO_OUTPUT</Rule>
      <Rule>TRACK_EQUIPMENT_USAGE</Rule>
      <Rule>CAPTURE_PROCESS_PARAMETERS</Rule>
    </LinkingRules>
  </GenealogyConfiguration>`;
  }

  private buildComplianceSettings(procedure: Procedure, options: OpcenterOptions): string {
    return `
  <ComplianceSettings>
    <ComplianceMode>${options.complianceMode}</ComplianceMode>
    <AuditTrail>
      <Enabled>true</Enabled>
      <CaptureLevel>DETAILED</CaptureLevel>
      <IncludeReasonForChange>true</IncludeReasonForChange>
    </AuditTrail>
    <ElectronicSignature>
      <Enabled>true</Enabled>
      <Part11Compliant>true</Part11Compliant>
      <RequirePassword>true</RequirePassword>
      <RequireReason>true</RequireReason>
    </ElectronicSignature>
    <DataIntegrity>
      <Enabled>true</Enabled>
      <ALCOACompliant>true</ALCOACompliant>
      <EnforceAttributable>true</EnforceAttributable>
      <EnforceLegible>true</EnforceLegible>
      <EnforceContemporaneous>true</EnforceContemporaneous>
      <EnforceOriginal>true</EnforceOriginal>
      <EnforceAccurate>true</EnforceAccurate>
    </DataIntegrity>
  </ComplianceSettings>`;
  }

  private mapStatus(status: string): string {
    const map: Record<string, string> = {
      draft: 'IN_DEVELOPMENT',
      approved: 'APPROVED',
      released: 'RELEASED',
      obsolete: 'OBSOLETE',
    };
    return map[status] || 'IN_DEVELOPMENT';
  }

  private mapPhaseType(type: Phase['type']): string {
    const map: Record<Phase['type'], string> = {
      manual: 'MANUAL',
      automatic: 'AUTOMATIC',
      'semi-automatic': 'SEMI_AUTOMATIC',
    };
    return map[type] || 'MANUAL';
  }

  private mapDataType(dataType: string): string {
    const map: Record<string, string> = {
      string: 'String',
      integer: 'Integer',
      real: 'Double',
      boolean: 'Boolean',
      datetime: 'DateTime',
      duration: 'TimeSpan',
      enumeration: 'Enum',
    };
    return map[dataType] || 'String';
  }

  private mapSignatureType(type: SignatureType): string {
    const map: Record<SignatureType, string> = {
      [SignatureType.PERFORM]: 'PERFORMED',
      [SignatureType.VERIFY]: 'VERIFIED',
      [SignatureType.APPROVE]: 'APPROVED',
      [SignatureType.REVIEW]: 'REVIEWED',
      [SignatureType.WITNESS]: 'WITNESSED',
    };
    return map[type] || 'PERFORMED';
  }
}

// Export singleton instance
export const opcenterGenerator = new OpcenterGenerator();
