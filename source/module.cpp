/******************************************************************************
    Copyright (C) 2016-2019 by Streamlabs (General Workings Inc)
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

#include <napi.h>
#include "hook.h"

void Init(Napi::Env env, Napi::Object exports)
{
#ifdef _WIN32
	ThreadData *threadData = InitializeHotkeyThread(env);
	if (threadData == nullptr)
		return;

	exports.Set(Napi::String::New(env, "startHook"), Napi::Function::New(env, StartHotkeyThreadJS, "startHook", threadData));
	exports.Set(Napi::String::New(env, "stopHook"), Napi::Function::New(env, StopHotkeyThreadJS, "stopHook", threadData));
	exports.Set(Napi::String::New(env, "registerCallback"), Napi::Function::New(env, RegisterHotkeyJS, "registerCallback", threadData));
	exports.Set(Napi::String::New(env, "unregisterCallback"), Napi::Function::New(env, UnregisterHotkeyJS, "unregisterCallback", threadData));
	exports.Set(Napi::String::New(env, "unregisterAllCallbacks"), Napi::Function::New(env, UnregisterHotkeysJS, "unregisterAllCallbacks", threadData));
#else
	exports.Set(Napi::String::New(env, "startHook"), Napi::Function::New(env, StartHotkeyThreadJS));
	exports.Set(Napi::String::New(env, "stopHook"), Napi::Function::New(env, StopHotkeyThreadJS));
	exports.Set(Napi::String::New(env, "registerCallback"), Napi::Function::New(env, RegisterHotkeyJS));
	exports.Set(Napi::String::New(env, "unregisterCallback"), Napi::Function::New(env, UnregisterHotkeyJS));
	exports.Set(Napi::String::New(env, "unregisterAllCallbacks"), Napi::Function::New(env, UnregisterHotkeysJS));
#endif
}

Napi::Object main_node(Napi::Env env, Napi::Object exports)
{
	Init(env, exports);
	return exports;
}

NODE_API_MODULE(uiohookModule, main_node)
