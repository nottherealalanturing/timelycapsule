// react-test-renderer's `act()` warns unless the environment explicitly
// opts in — this project has no other global test setup, so it lives here
// rather than duplicated per test file.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
