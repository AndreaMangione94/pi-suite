"""Compatibility entry point for the external module's optional Inspect adapter."""

import runpy
import suite_benchmarks  # Locate the installed dependency before importing its Python package.

suite_benchmarks.require()

if __name__ == '__main__':
    runpy.run_module('pi_suite_benchmarks.inspect_adapter', run_name='__main__')
else:
    from pi_suite_benchmarks import inspect_adapter

    def __getattr__(name):
        return getattr(inspect_adapter, name)
