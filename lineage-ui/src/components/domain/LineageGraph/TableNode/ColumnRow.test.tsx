import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ColumnRow, ColumnDefinition } from './ColumnRow';

// Mock @xyflow/react Handle component
vi.mock('@xyflow/react', () => ({
  Handle: (props: Record<string, unknown>) => (
    <div data-testid={`handle-${props.type}-${props.id}`} />
  ),
  Position: { Left: 'left', Right: 'right' },
}));

const makeColumn = (overrides: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  id: 'col-1',
  name: 'column_name',
  dataType: 'VARCHAR(100)',
  isPrimaryKey: false,
  isForeignKey: false,
  ...overrides,
});

const defaultProps = {
  tableId: 'table-1',
  isSelected: false,
  isHighlighted: false,
  isDimmed: false,
};

describe('ColumnRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders PK badge when column.isPrimaryKey is true', () => {
    render(
      <ColumnRow
        column={makeColumn({ isPrimaryKey: true })}
        {...defaultProps}
      />
    );

    expect(screen.getByText('PK')).toBeInTheDocument();
  });

  it('PK badge tooltip shows correct text on hover', () => {
    render(
      <ColumnRow
        column={makeColumn({ isPrimaryKey: true })}
        {...defaultProps}
      />
    );

    // The PK text is inside a Tooltip wrapper div
    const pkBadge = screen.getByText('PK');
    const tooltipWrapper = pkBadge.closest('div[class*="relative"]')!;
    fireEvent.mouseEnter(tooltipWrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Primary Key - uniquely identifies each row'
    );
  });

  it('renders FK badge when column.isForeignKey is true', () => {
    render(
      <ColumnRow
        column={makeColumn({ isForeignKey: true })}
        {...defaultProps}
      />
    );

    expect(screen.getByText('FK')).toBeInTheDocument();
  });

  it('FK badge tooltip shows correct text on hover', () => {
    render(
      <ColumnRow
        column={makeColumn({ isForeignKey: true })}
        {...defaultProps}
      />
    );

    const fkBadge = screen.getByText('FK');
    const tooltipWrapper = fkBadge.closest('div[class*="relative"]')!;
    fireEvent.mouseEnter(tooltipWrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      "Foreign Key - references another table's primary key"
    );
  });

  it('data type tooltip shows "Data type: {dataType}" on hover', () => {
    render(
      <ColumnRow
        column={makeColumn({ dataType: 'INTEGER' })}
        {...defaultProps}
      />
    );

    const dataTypeElement = screen.getByText('INTEGER');
    const tooltipWrapper = dataTypeElement.closest('div[class*="relative"]')!;
    fireEvent.mouseEnter(tooltipWrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip')).toHaveTextContent('Data type: INTEGER');
  });

  it('long column name (>=20 chars) shows tooltip with full name on hover', () => {
    const longName = 'this_is_a_very_long_column_name_for_testing';
    render(
      <ColumnRow
        column={makeColumn({ name: longName })}
        {...defaultProps}
      />
    );

    const nameElement = screen.getByText(longName);
    const tooltipWrapper = nameElement.closest('div[class*="relative"]')!;
    fireEvent.mouseEnter(tooltipWrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip')).toHaveTextContent(longName);
  });

  it('short column name (<20 chars) does NOT show tooltip', () => {
    const shortName = 'short_col';
    render(
      <ColumnRow
        column={makeColumn({ name: shortName })}
        {...defaultProps}
      />
    );

    const nameElement = screen.getByText(shortName);
    // For short names, Tooltip is disabled -- renders Fragment, no wrapper div
    const parentDiv = nameElement.parentElement!;
    // The parent should be the flex container (items-center gap-1.5), not a relative tooltip wrapper
    expect(parentDiv.className).not.toContain('relative inline-flex');
  });

  it('renders with selected styling (bg-blue-100)', () => {
    render(
      <ColumnRow
        column={makeColumn()}
        {...defaultProps}
        isSelected={true}
      />
    );

    const row = screen.getByTestId('column-row-col-1');
    expect(row.className).toContain('bg-blue-100');
    expect(row.className).toContain('border-blue-500');
  });

  it('renders with highlighted styling (bg-green-50)', () => {
    render(
      <ColumnRow
        column={makeColumn()}
        {...defaultProps}
        isHighlighted={true}
      />
    );

    const row = screen.getByTestId('column-row-col-1');
    expect(row.className).toContain('bg-green-50');
    expect(row.className).toContain('border-green-500');
  });

  it('renders with dimmed styling (opacity-20)', () => {
    render(
      <ColumnRow
        column={makeColumn()}
        {...defaultProps}
        isDimmed={true}
      />
    );

    const row = screen.getByTestId('column-row-col-1');
    expect(row.className).toContain('opacity-20');
  });

  it('calls onClick with column.id when clicked', () => {
    const onClick = vi.fn();
    render(
      <ColumnRow
        column={makeColumn({ id: 'my-col-id' })}
        {...defaultProps}
        onClick={onClick}
      />
    );

    fireEvent.click(screen.getByTestId('column-row-my-col-id'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('my-col-id');
  });

  it('click does not propagate (stopPropagation called)', () => {
    const parentHandler = vi.fn();
    const onClick = vi.fn();

    render(
      <div onClick={parentHandler}>
        <ColumnRow
          column={makeColumn()}
          {...defaultProps}
          onClick={onClick}
        />
      </div>
    );

    fireEvent.click(screen.getByTestId('column-row-col-1'));

    expect(onClick).toHaveBeenCalled();
    expect(parentHandler).not.toHaveBeenCalled();
  });
});
