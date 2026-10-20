import SwiftUI

/// What the island shows. Folded: a black capsule the notch's size with a wing
/// each side, the monkey left and the pencil right, clear of the camera. It
/// drops open, iPhone style, while Lev listens, thinks or speaks, to show what
/// Lev says, and when the person writes.
final class IslandModel: ObservableObject {
    @Published var writing = false
    /// Out of the notch (true) or tucked back into it (false): the enter and exit animation.
    @Published var present = false
    @Published var draft = ""
    @Published var state = IslandState()
    /// A short local message (the app is not open…), shown like a notice.
    @Published var localNotice: String? = nil
    /// Keeps the last reply visible for a moment after Lev finishes.
    @Published var lingering = false

    var onMonkey: () -> Void = {}
    var onSend: (String) -> Void = { _ in }

    var monkey: MonkeyState { MonkeyState(rawValue: state.monkey) ?? .idle }
    var busy: Bool { state.phase != "idle" }
    var message: String? {
        if let localNotice { return localNotice }
        if let notice = state.notice { return notice }
        switch state.phase {
        case "listening": return "Te escucho…"
        case "transcribing", "thinking": return state.reply ?? "Pensando…"
        default: return state.reply
        }
    }
    var expanded: Bool { present && (writing || busy || lingering || localNotice != nil) }
}

struct IslandView: View {
    @ObservedObject var model: IslandModel
    let notch: CGSize
    /// Room beside the camera for the monkey (left) and the pencil (right).
    static let wing: CGFloat = 54
    static let expandedSize = CGSize(width: 420, height: 150)

    private var foldedWidth: CGFloat { notch.width + IslandView.wing * 2 }

    var body: some View {
        let open = model.expanded
        let present = model.present
        VStack(spacing: 0) {
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    // The monkey is an AppKit drawing; a SwiftUI layer on top takes the click.
                    MonkeyView(state: model.monkey, mouthLevel: model.state.mouth, size: notch.height * 0.8)
                        .overlay(
                            Color.white.opacity(0.001)
                                .contentShape(Rectangle())
                                .onTapGesture { model.onMonkey() }
                        )
                        .accessibilityElement()
                        .accessibilityLabel("Hablar con Lev")
                        .accessibilityAddTraits(.isButton)
                    Spacer(minLength: notch.width)
                    Button {
                        model.writing.toggle()
                    } label: {
                        Image(systemName: model.writing ? "xmark" : "square.and.pencil")
                            .foregroundStyle(Color.white)
                            .font(.system(size: 14, weight: .semibold))
                            .frame(width: 26, height: 26)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Escribir a Lev")
                }
                .padding(.horizontal, 9)
                .frame(height: notch.height)
                .opacity(present ? 1 : 0)
                .scaleEffect(present ? 1 : 0.9)

                if open {
                    VStack(alignment: .leading, spacing: 10) {
                        if let message = model.message {
                            Text(message)
                                .font(.system(size: 13))
                                .foregroundStyle(.white.opacity(0.9))
                                .lineLimit(3)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .transition(.opacity)
                        }
                        if model.writing {
                            TextField("Escribe a Lev…", text: $model.draft)
                                .textFieldStyle(.plain)
                                .foregroundStyle(.white)
                                .font(.system(size: 13))
                                .padding(.horizontal, 14)
                                .frame(height: 34)
                                .background(Capsule().fill(Color.white.opacity(0.12)))
                                .onSubmit {
                                    let text = model.draft.trimmingCharacters(in: .whitespacesAndNewlines)
                                    guard !text.isEmpty else { return }
                                    model.onSend(text)
                                    model.draft = ""
                                    model.writing = false
                                }
                                .onExitCommand { model.writing = false }
                        }
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 8)
                    .padding(.bottom, 16)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .frame(width: open ? IslandView.expandedSize.width : present ? foldedWidth : notch.width, alignment: .top)
            .background(IslandShape(cornerRadius: open ? 34 : present ? notch.height * 0.62 : notch.height * 0.3).fill(Color.black))
            .clipShape(IslandShape(cornerRadius: open ? 34 : present ? notch.height * 0.62 : notch.height * 0.3))
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .animation(.spring(response: 0.42, dampingFraction: 0.8), value: open)
        // In: out of the camera with a little bounce. Out: quicker, no bounce.
        .animation(present ? .spring(response: 0.5, dampingFraction: 0.72) : .spring(response: 0.3, dampingFraction: 1), value: present)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: model.message)
    }
}

/// Flat top (it hangs from the screen's top edge), round continuous bottom corners.
struct IslandShape: Shape {
    var cornerRadius: CGFloat
    var animatableData: CGFloat {
        get { cornerRadius }
        set { cornerRadius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let r = min(cornerRadius, rect.height / 2, rect.width / 2)
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        path.addCurve(to: CGPoint(x: rect.maxX - r, y: rect.maxY), control1: CGPoint(x: rect.maxX, y: rect.maxY - r * 0.25), control2: CGPoint(x: rect.maxX - r * 0.25, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        path.addCurve(to: CGPoint(x: rect.minX, y: rect.maxY - r), control1: CGPoint(x: rect.minX + r * 0.25, y: rect.maxY), control2: CGPoint(x: rect.minX, y: rect.maxY - r * 0.25))
        path.closeSubpath()
        return path
    }
}
