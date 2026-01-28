/**
 * MODA Generator
 *
 * Generates Lonza MODA MES compatible XML from ISA-88 canonical model.
 * MODA is designed specifically for cell and gene therapy, and biologics
 * manufacturing with emphasis on flexibility and paper-on-glass workflows.
 */

import {
  Procedure,
  UnitProcedure,
  Operation,
  Phase,
  SignatureType,
} from '../models/isa88-canonical';
import { BaseGenerator, GeneratorOptions, GeneratorResult } from './base-generator';

export interface ModaOptions extends GeneratorOptions {
  facilityId?: string;
  suiteId?: string;
  includeDeviation?: boolean;
  includeCalculations?: boolean;
  includeAttachments?: boolean;
  templateStyle?: 'standard' | 'cgt' | 'biologics';
}

export class ModaGenerator extends BaseGenerator {
  readonly id = 'moda';
  readonly name = 'Lonza MODA';
  readonly description = 'Lonza MODA Manufacturing Execution System';
  readonly vendor = 'Lonza';
  readonly supportedVersions = ['3.0', '3.5', '4.0'];

  private readonly namespace = 'http://www.lonza.com/moda/ebr';

  generate(procedure: Procedure, options?: ModaOptions): GeneratorResult {
    const opts: ModaOptions = {
      ...this.getDefaultOptions(),
      ...options,
    };

    const xml = this.buildXml(procedure, opts);
    const stats = this.generateStatistics(procedure);

    return {
      content: opts.prettyPrint ? this.formatXml(xml) : xml,
      format: 'MODA EBR Template',
      mimeType: 'application/xml',
      fileExtension: 'xml',
      metadata: {
        generator: this.id,
        version: opts.targetVersion || '4.0',
        generatedAt: new Date().toISOString(),
        procedureName: procedure.header.name,
        statistics: stats,
      },
    };
  }

  getDefaultOptions(): ModaOptions {
    return {
      ...super.getDefaultOptions(),
      facilityId: 'FAC-001',
      suiteId: 'SUITE-001',
      includeDeviation: true,
      includeCalculations: true,
      includeAttachments: true,
      templateStyle: 'standard',
    };
  }

  private buildXml(procedure: Procedure, options: ModaOptions): string {
    const parts: string[] = [];

    // XML Declaration
    parts.push(`<?xml version="1.0" encoding="${options.encoding || 'UTF-8'}"?>`);

    // Root element
    parts.push(`<ModaEBRTemplate xmlns="${this.namespace}" version="${options.targetVersion || '4.0'}">`);

    // Template Header
    parts.push(this.buildTemplateHeader(procedure, options));

    // Workflow Definition
    parts.push(this.buildWorkflowDefinition(procedure, options));

    // Form Sections (Paper-on-Glass)
    parts.push(this.buildFormSections(procedure, options));

    // Deviation Handling
    if (options.includeDeviation) {
      parts.push(this.buildDeviationHandling(procedure));
    }

    // Calculations Configuration
    if (options.includeCalculations) {
      parts.push(this.buildCalculationsConfig(procedure));
    }

    // Attachment Configuration
    if (options.includeAttachments) {
      parts.push(this.buildAttachmentConfig(procedure));
    }

    // Close root
    parts.push('</ModaEBRTemplate>');

    return parts.join('\n');
  }

  private buildTemplateHeader(procedure: Procedure, options: ModaOptions): string {
    const h = procedure.header;
    return `
  <TemplateHeader>
    <TemplateId>${this.escapeXml(h.id)}</TemplateId>
    <TemplateName>${this.escapeXml(h.name)}</TemplateName>
    <Version>${this.escapeXml(h.version)}</Version>
    <Status>${this.mapStatus(h.status)}</Status>
    <TemplateStyle>${options.templateStyle?.toUpperCase()}</TemplateStyle>
    <Facility>${options.facilityId}</Facility>
    <Suite>${options.suiteId}</Suite>
    ${h.productCode ? `<ProductCode>${this.escapeXml(h.productCode)}</ProductCode>` : ''}
    ${h.productName ? `<ProductName>${this.escapeXml(h.productName)}</ProductName>` : ''}
    ${h.description ? `<Description>${this.escapeXml(h.description)}</Description>` : ''}
    <CreatedDate>${h.createdDate}</CreatedDate>
    <ModifiedDate>${h.modifiedDate}</ModifiedDate>
    ${h.author ? `<Author>${this.escapeXml(h.author)}</Author>` : ''}
    ${h.batchSize ? `
    <BatchSize>
      <NominalSize>${h.batchSize.nominal}</NominalSize>
      <MinSize>${h.batchSize.minimum}</MinSize>
      <MaxSize>${h.batchSize.maximum}</MaxSize>
      <Unit>${this.escapeXml(h.batchSize.unit)}</Unit>
    </BatchSize>` : ''}
  </TemplateHeader>`;
  }

  private buildWorkflowDefinition(procedure: Procedure, options: ModaOptions): string {
    return `
  <WorkflowDefinition>
    <WorkflowId>WF-${procedure.header.id}</WorkflowId>
    <WorkflowName>${this.escapeXml(procedure.header.name)} Workflow</WorkflowName>

    <Phases>
      ${procedure.unitProcedures.map((up, idx) => this.buildWorkflowPhase(up, idx, options)).join('')}
    </Phases>

    <Transitions>
      ${procedure.unitProcedures.map((up, idx) => {
        if (idx < procedure.unitProcedures.length - 1) {
          const next = procedure.unitProcedures[idx + 1];
          return `
      <Transition>
        <From>${this.escapeXml(up.id)}</From>
        <To>${this.escapeXml(next.id)}</To>
        <Type>SEQUENTIAL</Type>
        <Condition>COMPLETE</Condition>
      </Transition>`;
        }
        return '';
      }).join('')}
    </Transitions>

    <StateManagement>
      <States>
        <State id="NOT_STARTED" initial="true">Not Started</State>
        <State id="IN_PROGRESS">In Progress</State>
        <State id="ON_HOLD">On Hold</State>
        <State id="COMPLETE">Complete</State>
        <State id="CANCELLED">Cancelled</State>
      </States>
    </StateManagement>
  </WorkflowDefinition>`;
  }

  private buildWorkflowPhase(up: UnitProcedure, index: number, options: ModaOptions): string {
    return `
      <Phase sequence="${index + 1}">
        <PhaseId>${this.escapeXml(up.id)}</PhaseId>
        <PhaseName>${this.escapeXml(up.name)}</PhaseName>
        ${up.description ? `<Description>${this.escapeXml(up.description)}</Description>` : ''}

        <Steps>
          ${up.operations.map((op, opIdx) => this.buildWorkflowStep(op, opIdx)).join('')}
        </Steps>

        ${up.signatures.length > 0 ? `
        <PhaseSignoffs>
          ${up.signatures.map(sig => this.buildESignature(sig)).join('')}
        </PhaseSignoffs>` : ''}

        ${up.equipment.length > 0 ? `
        <EquipmentAllocation>
          ${up.equipment.map(eq => `
          <Equipment>
            <EquipmentId>${this.escapeXml(eq.id)}</EquipmentId>
            <EquipmentName>${this.escapeXml(eq.name)}</EquipmentName>
            <Required>true</Required>
            <VerifyStatus>true</VerifyStatus>
          </Equipment>`).join('')}
        </EquipmentAllocation>` : ''}
      </Phase>`;
  }

  private buildWorkflowStep(op: Operation, index: number): string {
    return `
          <Step sequence="${index + 1}">
            <StepId>${this.escapeXml(op.id)}</StepId>
            <StepName>${this.escapeXml(op.name)}</StepName>
            ${op.description ? `<Description>${this.escapeXml(op.description)}</Description>` : ''}

            <Tasks>
              ${op.phases.map((ph, phIdx) => this.buildTask(ph, phIdx)).join('')}
            </Tasks>

            ${op.signatures.length > 0 ? `
            <StepSignoffs>
              ${op.signatures.map(sig => this.buildESignature(sig)).join('')}
            </StepSignoffs>` : ''}

            ${op.cleaningRequired ? `
            <CleaningRequirement>
              <Required>true</Required>
              <Type>${(op.cleaningType || 'standard').toUpperCase()}</Type>
              <VerifyBeforeStart>true</VerifyBeforeStart>
            </CleaningRequirement>` : ''}
          </Step>`;
  }

  private buildTask(phase: Phase, index: number): string {
    return `
              <Task sequence="${index + 1}">
                <TaskId>${this.escapeXml(phase.id)}</TaskId>
                <TaskName>${this.escapeXml(phase.name)}</TaskName>
                <TaskType>${this.mapPhaseType(phase.type)}</TaskType>
                ${phase.description ? `<Description>${this.escapeXml(phase.description)}</Description>` : ''}

                ${phase.instructions ? `
                <Instruction>
                  <InstructionText>${this.escapeXml(phase.instructions)}</InstructionText>
                  <DisplayMode>INLINE</DisplayMode>
                </Instruction>` : ''}

                ${phase.parameters.length > 0 ? `
                <DataEntry>
                  ${phase.parameters.map(p => `
                  <Field>
                    <FieldId>${this.escapeXml(p.id)}</FieldId>
                    <FieldName>${this.escapeXml(p.name)}</FieldName>
                    <DataType>${this.mapDataType(p.dataType)}</DataType>
                    ${p.value !== undefined ? `<DefaultValue>${p.value}</DefaultValue>` : ''}
                    ${p.unit ? `<Unit>${this.escapeXml(p.unit)}</Unit>` : ''}
                    ${p.minimum !== undefined || p.maximum !== undefined ? `
                    <Limits>
                      ${p.minimum !== undefined ? `<Lower>${p.minimum}</Lower>` : ''}
                      ${p.maximum !== undefined ? `<Upper>${p.maximum}</Upper>` : ''}
                    </Limits>` : ''}
                    <Required>${p.required}</Required>
                    <Editable>true</Editable>
                  </Field>`).join('')}
                </DataEntry>` : ''}

                ${phase.materials.length > 0 ? `
                <MaterialVerification>
                  ${phase.materials.map(m => `
                  <Material>
                    <MaterialCode>${this.escapeXml(m.code)}</MaterialCode>
                    <MaterialName>${this.escapeXml(m.name)}</MaterialName>
                    <TargetQuantity>${m.quantity}</TargetQuantity>
                    <Unit>${this.escapeXml(m.unit)}</Unit>
                    ${m.tolerancePlus !== undefined ? `<TolerancePlus>${m.tolerancePlus}</TolerancePlus>` : ''}
                    ${m.toleranceMinus !== undefined ? `<ToleranceMinus>${m.toleranceMinus}</ToleranceMinus>` : ''}
                    <ScanRequired>true</ScanRequired>
                    <LotRequired>true</LotRequired>
                    <ExpiryCheck>true</ExpiryCheck>
                  </Material>`).join('')}
                </MaterialVerification>` : ''}

                ${phase.signatures.length > 0 ? `
                <TaskSignatures>
                  ${phase.signatures.map(sig => this.buildESignature(sig)).join('')}
                </TaskSignatures>` : ''}

                ${phase.interfaces.length > 0 ? `
                <IntegrationPoints>
                  ${phase.interfaces.map(iface => `
                  <Integration>
                    <System>${iface.system}</System>
                    <Direction>${iface.direction.toUpperCase()}</Direction>
                    <AutoTrigger>true</AutoTrigger>
                  </Integration>`).join('')}
                </IntegrationPoints>` : ''}

                ${phase.duration ? `
                <ExpectedDuration>
                  <Value>${phase.duration.estimated}</Value>
                  <Unit>${phase.duration.unit}</Unit>
                </ExpectedDuration>` : ''}
              </Task>`;
  }

  private buildESignature(sig: Phase['signatures'][0]): string {
    return `
                <ESignature>
                  <SignatureId>${this.escapeXml(sig.id)}</SignatureId>
                  <SignatureType>${this.mapSignatureType(sig.type)}</SignatureType>
                  <Role>${this.escapeXml(sig.role)}</Role>
                  <Sequence>${sig.order}</Sequence>
                  <Required>${sig.required}</Required>
                  ${sig.meaning ? `<Meaning>${this.escapeXml(sig.meaning)}</Meaning>` : ''}
                  <AuthenticationMethod>PASSWORD</AuthenticationMethod>
                  <ReasonRequired>false</ReasonRequired>
                </ESignature>`;
  }

  private buildFormSections(procedure: Procedure, options: ModaOptions): string {
    return `
  <FormSections>
    ${procedure.unitProcedures.map((up, idx) => `
    <Section sequence="${idx + 1}">
      <SectionId>SEC-${this.escapeXml(up.id)}</SectionId>
      <SectionTitle>${this.escapeXml(up.name)}</SectionTitle>
      <PageBreakBefore>${idx > 0}</PageBreakBefore>

      <FormElements>
        ${up.operations.flatMap(op => op.phases).map((ph, phIdx) => `
        <FormElement sequence="${phIdx + 1}">
          <ElementId>FE-${this.escapeXml(ph.id)}</ElementId>
          <ElementType>${this.getFormElementType(ph)}</ElementType>
          <Label>${this.escapeXml(ph.name)}</Label>
          ${ph.instructions ? `<HelpText>${this.escapeXml(ph.instructions)}</HelpText>` : ''}
          ${ph.parameters.length > 0 ? `
          <InputFields>
            ${ph.parameters.map(p => `
            <InputField>
              <FieldId>${this.escapeXml(p.id)}</FieldId>
              <Label>${this.escapeXml(p.name)}</Label>
              <InputType>${this.mapInputType(p.dataType)}</InputType>
              ${p.unit ? `<Unit>${this.escapeXml(p.unit)}</Unit>` : ''}
              <Width>MEDIUM</Width>
            </InputField>`).join('')}
          </InputFields>` : ''}
          ${ph.signatures.length > 0 ? `
          <SignatureFields>
            ${ph.signatures.map(sig => `
            <SignatureField>
              <FieldId>SIG-${this.escapeXml(sig.id)}</FieldId>
              <Label>${this.mapSignatureType(sig.type)}</Label>
              <Role>${this.escapeXml(sig.role)}</Role>
            </SignatureField>`).join('')}
          </SignatureFields>` : ''}
        </FormElement>`).join('')}
      </FormElements>
    </Section>`).join('')}
  </FormSections>`;
  }

  private buildDeviationHandling(procedure: Procedure): string {
    return `
  <DeviationHandling>
    <DeviationWorkflow>
      <Enabled>true</Enabled>
      <AutoCapture>true</AutoCapture>
      <Categories>
        <Category id="PROCESS">Process Deviation</Category>
        <Category id="EQUIPMENT">Equipment Deviation</Category>
        <Category id="MATERIAL">Material Deviation</Category>
        <Category id="DOCUMENTATION">Documentation Deviation</Category>
        <Category id="ENVIRONMENTAL">Environmental Deviation</Category>
      </Categories>
      <Severities>
        <Severity id="MINOR" escalation="false">Minor</Severity>
        <Severity id="MAJOR" escalation="true">Major</Severity>
        <Severity id="CRITICAL" escalation="true">Critical</Severity>
      </Severities>
      <RequiredFields>
        <Field>Description</Field>
        <Field>ImmediateAction</Field>
        <Field>RootCauseAnalysis</Field>
        <Field>CorrectiveAction</Field>
      </RequiredFields>
    </DeviationWorkflow>
    <OutOfSpecHandling>
      <TriggerOnLimitViolation>true</TriggerOnLimitViolation>
      <RequireJustification>true</RequireJustification>
      <RequireApproval>true</RequireApproval>
    </OutOfSpecHandling>
  </DeviationHandling>`;
  }

  private buildCalculationsConfig(procedure: Procedure): string {
    // Extract parameters that might need calculations
    const calcParams = procedure.unitProcedures
      .flatMap(up => up.operations)
      .flatMap(op => op.phases)
      .flatMap(ph => ph.parameters)
      .filter(p => p.dataType === 'real' || p.dataType === 'integer');

    return `
  <CalculationsConfiguration>
    <AutoCalculate>true</AutoCalculate>
    <RecalculateOnChange>true</RecalculateOnChange>

    <CalculatedFields>
      <Field id="YIELD">
        <Name>Yield Calculation</Name>
        <Formula>OUTPUT_QUANTITY / INPUT_QUANTITY * 100</Formula>
        <Unit>%</Unit>
        <Precision>2</Precision>
      </Field>
      <Field id="BATCH_SIZE_FACTOR">
        <Name>Batch Size Factor</Name>
        <Formula>ACTUAL_BATCH_SIZE / NOMINAL_BATCH_SIZE</Formula>
        <Unit></Unit>
        <Precision>4</Precision>
      </Field>
    </CalculatedFields>

    ${calcParams.length > 0 ? `
    <ScalableParameters>
      ${calcParams.slice(0, 5).map(p => `
      <Parameter ref="${this.escapeXml(p.id)}">
        <ScaleWithBatchSize>true</ScaleWithBatchSize>
        <RoundingMethod>ROUND_HALF_UP</RoundingMethod>
      </Parameter>`).join('')}
    </ScalableParameters>` : ''}
  </CalculationsConfiguration>`;
  }

  private buildAttachmentConfig(procedure: Procedure): string {
    return `
  <AttachmentConfiguration>
    <AllowAttachments>true</AllowAttachments>
    <AttachmentTypes>
      <Type id="IMAGE" maxSize="10MB">
        <Extensions>jpg,jpeg,png,gif,bmp</Extensions>
        <Description>Images and Photos</Description>
      </Type>
      <Type id="DOCUMENT" maxSize="25MB">
        <Extensions>pdf,doc,docx,xls,xlsx</Extensions>
        <Description>Documents</Description>
      </Type>
      <Type id="CERTIFICATE" maxSize="10MB">
        <Extensions>pdf</Extensions>
        <Description>Certificates and COAs</Description>
      </Type>
    </AttachmentTypes>
    <AttachmentPoints>
      ${procedure.unitProcedures.map(up => `
      <Point ref="${this.escapeXml(up.id)}">
        <AllowedTypes>IMAGE,DOCUMENT,CERTIFICATE</AllowedTypes>
        <Required>false</Required>
      </Point>`).join('')}
    </AttachmentPoints>
    <StorageSettings>
      <Location>INTEGRATED</Location>
      <RetentionPeriod>7 YEARS</RetentionPeriod>
    </StorageSettings>
  </AttachmentConfiguration>`;
  }

  private getFormElementType(phase: Phase): string {
    if (phase.parameters.length > 0) return 'DATA_ENTRY';
    if (phase.materials.length > 0) return 'MATERIAL_VERIFICATION';
    if (phase.signatures.length > 0) return 'SIGNATURE_BLOCK';
    return 'INSTRUCTION';
  }

  private mapStatus(status: string): string {
    const map: Record<string, string> = {
      draft: 'DRAFT',
      approved: 'APPROVED',
      released: 'EFFECTIVE',
      obsolete: 'SUPERSEDED',
    };
    return map[status] || 'DRAFT';
  }

  private mapPhaseType(type: Phase['type']): string {
    const map: Record<Phase['type'], string> = {
      manual: 'MANUAL',
      automatic: 'AUTOMATIC',
      'semi-automatic': 'GUIDED',
    };
    return map[type] || 'MANUAL';
  }

  private mapDataType(dataType: string): string {
    const map: Record<string, string> = {
      string: 'TEXT',
      integer: 'INTEGER',
      real: 'DECIMAL',
      boolean: 'CHECKBOX',
      datetime: 'DATETIME',
      duration: 'DURATION',
      enumeration: 'DROPDOWN',
    };
    return map[dataType] || 'TEXT';
  }

  private mapInputType(dataType: string): string {
    const map: Record<string, string> = {
      string: 'TEXT',
      integer: 'NUMBER',
      real: 'DECIMAL',
      boolean: 'CHECKBOX',
      datetime: 'DATETIME_PICKER',
      duration: 'DURATION_PICKER',
      enumeration: 'SELECT',
    };
    return map[dataType] || 'TEXT';
  }

  private mapSignatureType(type: SignatureType): string {
    const map: Record<SignatureType, string> = {
      [SignatureType.PERFORM]: 'Performed By',
      [SignatureType.VERIFY]: 'Verified By',
      [SignatureType.APPROVE]: 'Approved By',
      [SignatureType.REVIEW]: 'Reviewed By',
      [SignatureType.WITNESS]: 'Witnessed By',
    };
    return map[type] || 'Performed By';
  }
}

// Export singleton instance
export const modaGenerator = new ModaGenerator();
