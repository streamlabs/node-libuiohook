#include <windows.h>

#include <cstdlib>

static bool SendF24(INPUT &input, bool keyUp)
{
	input.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
	return SendInput(1, &input, sizeof(input)) == 1;
}

int main(int argc, char **argv)
{
	const int repetitions = argc > 1 ? std::atoi(argv[1]) : 1;
	const DWORD holdMilliseconds = argc > 2 ? static_cast<DWORD>(std::atoi(argv[2])) : 15;
	if (repetitions < 0 || holdMilliseconds == 0)
		return 2;

	INPUT input = {};
	input.type = INPUT_KEYBOARD;
	input.ki.wVk = VK_F24;
	int result = 0;

	// Normalize state left behind by an interrupted prior run before generating
	// any test input. A duplicate key-up does not create another transition.
	if (!SendF24(input, true))
		result = 5;
	Sleep(holdMilliseconds);

	for (int index = 0; result == 0 && index < repetitions; ++index) {
		if (!SendF24(input, false)) {
			result = 3;
			break;
		}

		Sleep(holdMilliseconds);
		if (!SendF24(input, true)) {
			result = 4;
			break;
		}

		Sleep(holdMilliseconds);
	}

	// Best effort even after a failed key-down/key-up, so a failed test does not
	// leave F24 pressed for later jobs or a developer's desktop session.
	if (!SendF24(input, true) && result == 0)
		result = 6;

	return result;
}
