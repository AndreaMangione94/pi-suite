"""Windows Explorer folder picker, without PowerShell or optional GUI packages."""
from __future__ import annotations

import ctypes
import os
import uuid
from pathlib import Path


class GUID(ctypes.Structure):
    _fields_ = [('data1', ctypes.c_uint32), ('data2', ctypes.c_uint16),
                ('data3', ctypes.c_uint16), ('data4', ctypes.c_ubyte * 8)]

    @classmethod
    def parse(cls, value):
        return cls.from_buffer_copy(uuid.UUID(value).bytes_le)


def _method(instance, index, result_type, *argument_types):
    # COM methods begin with the interface pointer (the implicit `this`).
    table = ctypes.cast(instance, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
    return ctypes.WINFUNCTYPE(result_type, ctypes.c_void_p, *argument_types)(table[index])


def _check(result):
    if result < 0:
        raise OSError('Errore del selettore Windows (HRESULT 0x%08X).' % (result & 0xffffffff))


def choose_folder(initial_path='', title='Scegli una cartella'):
    """Return an absolute filesystem path, or an empty string on cancellation.

    IFileDialog runs in the calling HTTP worker's STA. Every acquired COM
    reference is released before returning; no detached picker process survives.
    """
    if os.name != 'nt':
        raise ValueError('La selezione della cartella richiede Windows.')
    from ctypes import wintypes

    ole32 = ctypes.WinDLL('ole32')
    shell32 = ctypes.WinDLL('shell32')
    user32 = ctypes.WinDLL('user32')
    hresult = ctypes.c_long
    pointer = ctypes.c_void_p
    ole32.CoInitializeEx.argtypes = [pointer, wintypes.DWORD]
    ole32.CoInitializeEx.restype = hresult
    ole32.CoUninitialize.argtypes = []
    ole32.CoUninitialize.restype = None
    ole32.CoCreateInstance.argtypes = [ctypes.POINTER(GUID), pointer, wintypes.DWORD,
                                     ctypes.POINTER(GUID), ctypes.POINTER(pointer)]
    ole32.CoCreateInstance.restype = hresult
    ole32.CoTaskMemFree.argtypes = [pointer]
    ole32.CoTaskMemFree.restype = None
    shell32.SHCreateItemFromParsingName.argtypes = [wintypes.LPCWSTR, pointer,
                                                   ctypes.POINTER(GUID), ctypes.POINTER(pointer)]
    shell32.SHCreateItemFromParsingName.restype = hresult
    user32.GetForegroundWindow.argtypes = []
    user32.GetForegroundWindow.restype = wintypes.HWND

    # Preserve the browser's foreground window as owner so Explorer opens above it.
    owner = user32.GetForegroundWindow()
    _check(ole32.CoInitializeEx(None, 2))  # COINIT_APARTMENTTHREADED
    dialog, folder, selection, name = pointer(), pointer(), pointer(), pointer()
    try:
        clsid = GUID.parse('dc1c5a9c-e88a-4dde-a5a1-60f82a20aef7')
        iid = GUID.parse('42f85136-db7e-439c-85f1-e4075d135fc8')  # IFileDialog
        shell_iid = GUID.parse('43826d1e-e718-42ee-bc55-a1e261c37bfe')  # IShellItem
        _check(ole32.CoCreateInstance(ctypes.byref(clsid), None, 1, ctypes.byref(iid), ctypes.byref(dialog)))
        options = wintypes.DWORD()
        _check(_method(dialog, 10, hresult, ctypes.POINTER(wintypes.DWORD))(dialog, ctypes.byref(options)))
        # PICKFOLDERS | FORCEFILESYSTEM | PATHMUSTEXIST; retain the native defaults.
        _check(_method(dialog, 9, hresult, wintypes.DWORD)(dialog, options.value | 0x20 | 0x40 | 0x800))
        _check(_method(dialog, 17, hresult, wintypes.LPCWSTR)(dialog, title))
        _check(_method(dialog, 18, hresult, wintypes.LPCWSTR)(dialog, 'Seleziona cartella'))
        if initial_path:
            path = Path(initial_path).expanduser()
            # A removed folder or a file path starts browsing from its nearest parent.
            while not path.is_dir() and path != path.parent:
                path = path.parent
            if path.is_dir():
                _check(shell32.SHCreateItemFromParsingName(str(path.resolve()), None,
                                                          ctypes.byref(shell_iid), ctypes.byref(folder)))
                _check(_method(dialog, 12, hresult, pointer)(dialog, folder))
        result = _method(dialog, 3, hresult, wintypes.HWND)(dialog, owner)
        if result & 0xffffffff == 0x800704c7:  # HRESULT_FROM_WIN32(ERROR_CANCELLED)
            return ''
        _check(result)
        _check(_method(dialog, 20, hresult, ctypes.POINTER(pointer))(dialog, ctypes.byref(selection)))
        _check(_method(selection, 5, hresult, wintypes.DWORD, ctypes.POINTER(pointer))(
            selection, 0x80058000, ctypes.byref(name)))  # SIGDN_FILESYSPATH
        return ctypes.wstring_at(name)
    finally:
        if name:
            ole32.CoTaskMemFree(name)
        for item in (selection, folder, dialog):
            if item:
                _method(item, 2, wintypes.ULONG)(item)
        ole32.CoUninitialize()
