import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, LogOut, Sparkles, ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchBoards();
  }, []);

  const fetchBoards = async () => {
    try {
      const response = await axios.get(`${API}/boards`);
      setBoards(response.data);
    } catch (error) {
      toast.error('Failed to load boards');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBoard = async (e) => {
    e.preventDefault();
    setCreating(true);

    try {
      const response = await axios.post(`${API}/boards`, {
        title: newBoardTitle,
        description: newBoardDescription
      });
      toast.success('Board created!');
      setBoards([response.data, ...boards]);
      setCreateDialogOpen(false);
      setNewBoardTitle('');
      setNewBoardDescription('');
    } catch (error) {
      toast.error('Failed to create board');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBoard = async (boardId) => {
    if (!window.confirm('Are you sure you want to delete this board?')) return;

    try {
      await axios.delete(`${API}/boards/${boardId}`);
      toast.success('Board deleted');
      setBoards(boards.filter(b => b.id !== boardId));
    } catch (error) {
      toast.error('Failed to delete board');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-[#0A1929]">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-black/5">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold" style={{letterSpacing: '-0.02em'}}>CanvasFlow</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground" data-testid="user-name">Hello, {user?.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="rounded-full"
              data-testid="logout-button"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{letterSpacing: '-0.02em'}} data-testid="dashboard-title">
              My Boards
            </h1>
            <p className="text-muted-foreground">Create and manage your collaborative whiteboards</p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full h-11 px-6" data-testid="create-board-button">
                <Plus className="w-5 h-5 mr-2" />
                New Board
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Board</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateBoard} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title" data-testid="board-title-label">Board Title</Label>
                  <Input
                    id="title"
                    placeholder="My Awesome Board"
                    value={newBoardTitle}
                    onChange={(e) => setNewBoardTitle(e.target.value)}
                    required
                    data-testid="board-title-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" data-testid="board-description-label">Description (optional)</Label>
                  <Input
                    id="description"
                    placeholder="A brief description..."
                    value={newBoardDescription}
                    onChange={(e) => setNewBoardDescription(e.target.value)}
                    data-testid="board-description-input"
                  />
                </div>
                <Button type="submit" className="w-full rounded-full" disabled={creating} data-testid="create-board-submit">
                  {creating ? 'Creating...' : 'Create Board'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Boards Grid */}
        {loading ? (
          <div className="text-center py-12" data-testid="loading-state">
            <p className="text-muted-foreground">Loading boards...</p>
          </div>
        ) : boards.length === 0 ? (
          <div className="text-center py-12 glass rounded-2xl" data-testid="empty-state">
            <p className="text-muted-foreground mb-4">No boards yet. Create your first board to get started!</p>
            <Button onClick={() => setCreateDialogOpen(true)} className="rounded-full" data-testid="empty-create-button">
              <Plus className="w-5 h-5 mr-2" />
              Create Your First Board
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="boards-grid">
            {boards.map((board) => (
              <div
                key={board.id}
                className="glass rounded-2xl p-6 hover:bg-white/80 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
                data-testid={`board-card-${board.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold truncate flex-1" data-testid="board-title">{board.title}</h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBoard(board.id);
                      }}
                      data-testid="delete-board-button"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {board.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2" data-testid="board-description">
                    {board.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                  <span>{board.objects?.length || 0} objects</span>
                  <span>Version {board.version}</span>
                </div>
                <Button
                  className="w-full rounded-full"
                  onClick={() => navigate(`/board/${board.id}`)}
                  data-testid="open-board-button"
                >
                  Open Board
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
