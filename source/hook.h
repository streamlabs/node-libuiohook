/******************************************************************************
    Copyright (C) 2016-2020 by Streamlabs (General Workings Inc)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

******************************************************************************/

#pragma once
#include <napi.h>
#include <iostream>

Napi::Value StartHotkeyThreadJS(const Napi::CallbackInfo &info);
Napi::Value StopHotkeyThreadJS(const Napi::CallbackInfo &info);
Napi::Value RegisterHotkeyJS(const Napi::CallbackInfo &info);
Napi::Value UnregisterHotkeyJS(const Napi::CallbackInfo &info);
Napi::Value UnregisterHotkeysJS(const Napi::CallbackInfo &info);

#ifdef _WIN32
struct ThreadData;
ThreadData *InitializeHotkeyThread(Napi::Env env);
#endif
