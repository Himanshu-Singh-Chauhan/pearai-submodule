import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  defaultBorderRadius,
  greenButtonColor,
  lightGray,
  vscBackground,
} from '../components';
import { useNavigationListener } from '../hooks/useNavigationListener';
import { postToIde } from '../util/ide';

const GridDiv = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  grid-gap: 1rem;
  padding: 1rem;
  justify-items: center;
  align-items: center;
`;

export const CustomModelButton = styled.div<{
  color: string;
  disabled: boolean;
}>`
  border: 1px solid ${lightGray};
  border-radius: ${defaultBorderRadius};
  padding: 4px 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.5s;

  ${(props) =>
    props.disabled
      ? `
    opacity: 0.5;
    `
      : `
  &:hover {
    border: 1px solid ${props.color};
    background-color: ${props.color}22;
    cursor: pointer;
  }
  `}
`;

function NoModelFound() {
  useNavigationListener();
  const navigate = useNavigate();

  return (
      <div className='overflow-y-scroll'>
        <div
          className='items-center flex m-0 p-0 sticky top-0'
          style={{
            borderBottom: `0.5px solid ${lightGray}`,
            backgroundColor: vscBackground,
            zIndex: 2,
          }}
        >
          <ArrowLeftIcon
            width='1.2em'
            height='1.2em'
            onClick={() => navigate('/onboarding')}
            className='inline-block ml-4 cursor-pointer'
          />
          <h3 className='text-lg font-bold m-2 inline-block'>
            No Models found
          </h3>
        </div>

        <div className='px-2'>
          <>
            <GridDiv>
            <h3 className='mb-0 mr-auto'>Select a model preset</h3>
              <div style={{ padding: '8px' }} className='mb-0 w-full'>
                <p style={{ color: lightGray }}>
                  Please select a model preset to continue.
                </p>
                <CustomModelButton
                  color={greenButtonColor}
                  disabled={false}
                  onClick={() => navigate("/models")}
                >
                  <h3 className='text-center my-2'>Select a Model</h3>
                </CustomModelButton>
              </div>

                <hr
                  style={{
                    color: lightGray,
                    border: `1px solid ${lightGray}`,
                  }}
                  className='w-full'
                />
              <div style={{ padding: '8px' }} className='w-full'>
                <p style={{ color: lightGray }} className='mt-0'>
                  OR choose from other providers / models by editing
                  config.json.
                </p>
                <CustomModelButton
                  color='#be1b55'
                  disabled={false}
                  onClick={() => postToIde('openConfigJson', undefined)}
                >
                  <h3 className='text-center my-2'>Open config.json</h3>
                </CustomModelButton>
              </div>
            </GridDiv>
          </>
        </div>
      </div>
  );
}

export default NoModelFound;
